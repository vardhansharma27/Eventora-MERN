const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');
const { getRazorpayInstance } = require('../utils/razorpay');
const { withTransaction, reserveSeat, releaseSeat, ensureSeatAvailableForFreeBooking, SeatError } = require('../utils/seats');
const { generateTicketToken, verifyTicketToken } = require('../utils/ticket');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const handleSeatError = (res, error) => {
    if (error instanceof SeatError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server Error', error: error.message });
};

exports.sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await OTP.findOneAndDelete({ email: req.user.email, action: 'event_booking' });
        await OTP.create({ email: req.user.email, otp, action: 'event_booking' });
        const emailSent = await sendOTPEmail(req.user.email, otp, 'event_booking');
        res.json({ message: emailSent ? 'OTP sent successfully' : 'OTP created but email failed to send', emailSent });
    } catch (error) {
        res.status(500).json({ message: 'Error sending OTP', error: error.message });
    }
};

exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body;

        const validOTP = await OTP.findOne({ email: req.user.email, otp, action: 'event_booking' });
        if (!validOTP) {
            return res.status(400).json({ message: 'Invalid or expired OTP for booking' });
        }

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const existingBooking = await Booking.findOne({ userId: req.user.id, eventId });
        if (existingBooking && existingBooking.status !== 'cancelled') {
            return res.status(400).json({ message: 'Already booked or pending' });
        }

        await OTP.deleteOne({ _id: validOTP._id });

        const isPaidEvent = event.ticketPrice > 0;

        if (isPaidEvent) {
            let razorpay;
            try {
                razorpay = getRazorpayInstance();
            } catch {
                return res.status(503).json({ message: 'Payment gateway is not configured. Contact admin.' });
            }

            const booking = await withTransaction(async (session) => {
                await reserveSeat(eventId, session);
                return Booking.create([{
                    userId: req.user.id,
                    eventId,
                    status: 'pending_payment',
                    paymentStatus: 'not_paid',
                    amount: event.ticketPrice
                }], { session });
            });

            const createdBooking = booking[0];
            const receipt = `evt_${eventId.toString().slice(-8)}_${Date.now()}`;

            let order;
            try {
                order = await razorpay.orders.create({
                    amount: event.ticketPrice * 100,
                    currency: 'INR',
                    receipt,
                    notes: {
                        eventId: eventId.toString(),
                        userId: req.user.id.toString(),
                        bookingId: createdBooking._id.toString()
                    }
                });
            } catch (razorpayError) {
                await withTransaction(async (session) => {
                    const fresh = await Booking.findById(createdBooking._id).session(session);
                    if (fresh && fresh.status === 'pending_payment') {
                        fresh.status = 'cancelled';
                        await fresh.save({ session });
                        await releaseSeat(eventId, session);
                    }
                });
                return res.status(502).json({ message: 'Failed to create payment order. Please try again.' });
            }

            createdBooking.razorpayOrderId = order.id;
            await createdBooking.save();

            return res.status(201).json({
                message: 'Complete payment to confirm your booking',
                booking: createdBooking,
                payment: {
                    orderId: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    keyId: process.env.RAZORPAY_KEY_ID
                }
            });
        }

        const booking = await withTransaction(async (session) => {
            await ensureSeatAvailableForFreeBooking(eventId, session);
            const created = await Booking.create([{
                userId: req.user.id,
                eventId,
                status: 'pending',
                paymentStatus: 'not_paid',
                amount: 0
            }], { session });
            return created[0];
        });

        res.status(201).json({ message: 'Booking request submitted. Awaiting admin confirmation.', booking });
    } catch (error) {
        return handleSeatError(res, error);
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body;

        const result = await withTransaction(async (session) => {
            const booking = await Booking.findById(req.params.id).session(session);
            if (!booking) {
                throw new SeatError('Booking not found', 404);
            }
            if (booking.status === 'confirmed') {
                throw new SeatError('Booking is already confirmed', 400);
            }
            if (booking.status !== 'pending') {
                throw new SeatError('Only pending free bookings can be confirmed by admin', 400);
            }

            await reserveSeat(booking.eventId, session);

            booking.status = 'confirmed';
            if (paymentStatus) {
                booking.paymentStatus = paymentStatus;
            }
            await booking.save({ session });

            return booking;
        });

        const populated = await Booking.findById(result._id)
            .populate('userId', 'name email')
            .populate('eventId', 'title');

        await sendBookingEmail(
            populated.userId.email,
            populated.userId.name,
            populated.eventId.title
        );

        res.json({ message: 'Booking confirmed successfully', booking: populated });
    } catch (error) {
        return handleSeatError(res, error);
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 })
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        await withTransaction(async (session) => {
            const booking = await Booking.findById(req.params.id).session(session);
            if (!booking) {
                throw new SeatError('Booking not found', 404);
            }
            if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
                throw new SeatError('Not authorized', 403);
            }
            if (booking.status === 'cancelled') {
                throw new SeatError('Already cancelled', 400);
            }

            const shouldReleaseSeat =
                booking.status === 'confirmed' || booking.status === 'pending_payment';

            booking.status = 'cancelled';
            await booking.save({ session });

            if (shouldReleaseSeat) {
                await releaseSeat(booking.eventId, session);
            }
        });

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        return handleSeatError(res, error);
    }
};

exports.getTicket = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('eventId', 'title date location')
            .populate('userId', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        if (booking.userId._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status !== 'confirmed') {
            return res.status(400).json({ message: 'Ticket available only for confirmed bookings' });
        }

        const token = generateTicketToken(booking);

        res.json({
            token,
            checkedIn: Boolean(booking.checkedInAt),
            checkedInAt: booking.checkedInAt,
            booking: {
                _id: booking._id,
                status: booking.status,
                amount: booking.amount
            },
            event: booking.eventId,
            attendee: { name: booking.userId.name, email: booking.userId.email }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.verifyTicket = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Ticket token is required' });
        }

        let decoded;
        try {
            decoded = verifyTicketToken(token);
        } catch {
            return res.status(400).json({ message: 'Invalid or expired ticket' });
        }

        const booking = await Booking.findById(decoded.bid)
            .populate('eventId', 'title date location')
            .populate('userId', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        if (booking.status !== 'confirmed') {
            return res.status(400).json({ valid: false, message: 'Ticket is no longer valid' });
        }
        if (booking.userId._id.toString() !== decoded.uid || booking.eventId._id.toString() !== decoded.eid) {
            return res.status(400).json({ valid: false, message: 'Ticket data mismatch' });
        }

        const alreadyCheckedIn = Boolean(booking.checkedInAt);
        if (!alreadyCheckedIn) {
            booking.checkedInAt = new Date();
            await booking.save();
        }

        res.json({
            valid: true,
            alreadyCheckedIn,
            message: alreadyCheckedIn ? 'Ticket already scanned at gate' : 'Ticket verified — entry granted',
            checkedInAt: booking.checkedInAt,
            attendee: { name: booking.userId.name, email: booking.userId.email },
            event: booking.eventId,
            bookingId: booking._id
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
