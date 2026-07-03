const request = require('supertest');
const app = require('../app');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const { createUser, createEvent, createBookingOTP } = require('./helpers');

describe('Booking API', () => {
    let user;
    let userToken;
    let admin;
    let adminToken;
    let event;

    beforeEach(async () => {
        ({ user, token: userToken } = await createUser({ name: 'Booker' }));
        ({ user: admin, token: adminToken } = await createUser({
            name: 'Admin',
            email: 'admin@test.com',
            role: 'admin'
        }));
        event = await createEvent(admin._id, { totalSeats: 2, availableSeats: 2, ticketPrice: 0 });
    });

    it('creates a pending booking for a free event after OTP verification', async () => {
        await createBookingOTP(user.email, '111111');

        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '111111' });

        expect(res.status).toBe(201);
        expect(res.body.booking.status).toBe('pending');

        const stored = await Booking.findOne({ userId: user._id, eventId: event._id });
        expect(stored).toBeTruthy();
        expect(stored.amount).toBe(0);
    });

    it('rejects booking without valid OTP', async () => {
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '999999' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid/i);
    });

    it('rejects duplicate active bookings for the same event', async () => {
        await createBookingOTP(user.email, '222222');
        await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '222222' });

        await createBookingOTP(user.email, '333333');
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '333333' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already booked/i);
    });

    it('admin confirms a free booking and decrements available seats', async () => {
        await createBookingOTP(user.email, '444444');
        const bookRes = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '444444' });

        const confirmRes = await request(app)
            .put(`/api/bookings/${bookRes.body.booking._id}/confirm`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ paymentStatus: 'not_paid' });

        expect(confirmRes.status).toBe(200);
        expect(confirmRes.body.booking.status).toBe('confirmed');

        const updatedEvent = await Event.findById(event._id);
        expect(updatedEvent.availableSeats).toBe(1);
    });

    it('cancelling a confirmed booking restores the seat', async () => {
        await createBookingOTP(user.email, '555555');
        const bookRes = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '555555' });

        await request(app)
            .put(`/api/bookings/${bookRes.body.booking._id}/confirm`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ paymentStatus: 'not_paid' });

        const cancelRes = await request(app)
            .delete(`/api/bookings/${bookRes.body.booking._id}`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(cancelRes.status).toBe(200);

        const updatedEvent = await Event.findById(event._id);
        expect(updatedEvent.availableSeats).toBe(2);
    });

    it('reserves a seat for paid events and returns Razorpay order details', async () => {
        const paidEvent = await createEvent(admin._id, {
            title: 'Paid Concert',
            totalSeats: 1,
            availableSeats: 1,
            ticketPrice: 500
        });

        await createBookingOTP(user.email, '666666');
        const res = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: paidEvent._id, otp: '666666' });

        expect(res.status).toBe(201);
        expect(res.body.booking.status).toBe('pending_payment');
        expect(res.body.payment.orderId).toBeTruthy();

        const updatedEvent = await Event.findById(paidEvent._id);
        expect(updatedEvent.availableSeats).toBe(0);
    });
});
