const crypto = require('crypto');
const Booking = require('../models/Booking');
const { sendBookingEmail } = require('../utils/email');
const { withTransaction, SeatError } = require('../utils/seats');

const confirmPaidBooking = async (booking, paymentId, signature) => {
    const result = await withTransaction(async (session) => {
        const fresh = await Booking.findById(booking._id).session(session);
        if (!fresh) {
            throw new Error('Booking not found');
        }
        if (fresh.status === 'confirmed') {
            return { alreadyConfirmed: true, booking: fresh };
        }
        if (fresh.status !== 'pending_payment') {
            throw new Error('Booking is not awaiting payment');
        }

        // Seat was reserved when the Razorpay order was created
        fresh.status = 'confirmed';
        fresh.paymentStatus = 'paid';
        fresh.razorpayPaymentId = paymentId;
        if (signature) fresh.razorpaySignature = signature;
        await fresh.save({ session });

        return { alreadyConfirmed: false, booking: fresh };
    });

    if (result.alreadyConfirmed) {
        return Booking.findById(booking._id)
            .populate('userId', 'name email')
            .populate('eventId', 'title');
    }

    const populated = await Booking.findById(result.booking._id)
        .populate('userId', 'name email')
        .populate('eventId', 'title');

    await sendBookingEmail(
        populated.userId.email,
        populated.userId.name,
        populated.eventId.title
    );

    return populated;
};

exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
            return res.status(400).json({ message: 'Missing payment details' });
        }

        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: 'Invalid payment signature' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        if (booking.userId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.razorpayOrderId !== razorpay_order_id) {
            return res.status(400).json({ message: 'Order mismatch' });
        }

        const confirmed = await confirmPaidBooking(booking, razorpay_payment_id, razorpay_signature);
        res.json({ message: 'Payment verified successfully', booking: confirmed });
    } catch (error) {
        const status = error.statusCode || 500;
        res.status(status).json({ message: error.message || 'Payment verification failed' });
    }
};

exports.handleWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            return res.status(500).json({ message: 'Webhook secret not configured' });
        }

        const signature = req.headers['x-razorpay-signature'];
        const rawBody = req.body;

        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== signature) {
            return res.status(400).json({ message: 'Invalid webhook signature' });
        }

        const payload = JSON.parse(rawBody.toString());

        if (payload.event === 'payment.captured') {
            const payment = payload.payload.payment.entity;
            const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
            if (booking && booking.status === 'pending_payment') {
                await confirmPaidBooking(booking, payment.id);
            }
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
};

module.exports.confirmPaidBooking = confirmPaidBooking;
