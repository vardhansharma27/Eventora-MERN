const request = require('supertest');
const app = require('../app');
const Booking = require('../models/Booking');
const { createUser, createEvent, createBookingOTP } = require('./helpers');
const { generateTicketToken } = require('../utils/ticket');

describe('QR Ticket API', () => {
    let user;
    let userToken;
    let admin;
    let adminToken;
    let event;
    let booking;

    beforeEach(async () => {
        ({ user, token: userToken } = await createUser({ name: 'Ticket User' }));
        ({ user: admin, token: adminToken } = await createUser({
            name: 'Admin',
            email: 'ticket-admin@test.com',
            role: 'admin'
        }));
        event = await createEvent(admin._id, { totalSeats: 5, availableSeats: 5, ticketPrice: 0 });

        await createBookingOTP(user.email, '777777');
        const bookRes = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ eventId: event._id, otp: '777777' });

        await request(app)
            .put(`/api/bookings/${bookRes.body.booking._id}/confirm`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ paymentStatus: 'not_paid' });

        booking = await Booking.findById(bookRes.body.booking._id);
    });

    it('returns a signed ticket token for confirmed bookings', async () => {
        const res = await request(app)
            .get(`/api/bookings/${booking._id}/ticket`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.event.title).toBe('Test Event');
        expect(res.body.attendee.name).toBe('Ticket User');
        expect(res.body.checkedIn).toBe(false);
    });

    it('rejects ticket request for pending bookings', async () => {
        const { user: u2, token: t2 } = await createUser({ email: 'pending-user@test.com' });
        await createBookingOTP(u2.email, '888888');
        const pendingRes = await request(app)
            .post('/api/bookings')
            .set('Authorization', `Bearer ${t2}`)
            .send({ eventId: event._id, otp: '888888' });

        const res = await request(app)
            .get(`/api/bookings/${pendingRes.body.booking._id}/ticket`)
            .set('Authorization', `Bearer ${t2}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/confirmed/i);
    });

    it('admin verifies a valid ticket and marks check-in', async () => {
        const token = generateTicketToken(booking);

        const res = await request(app)
            .post('/api/bookings/verify-ticket')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ token });

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        expect(res.body.alreadyCheckedIn).toBe(false);
        expect(res.body.attendee.email).toBe(user.email);

        const updated = await Booking.findById(booking._id);
        expect(updated.checkedInAt).toBeTruthy();
    });

    it('detects duplicate check-in on second scan', async () => {
        const token = generateTicketToken(booking);

        await request(app)
            .post('/api/bookings/verify-ticket')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ token });

        const res = await request(app)
            .post('/api/bookings/verify-ticket')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ token });

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        expect(res.body.alreadyCheckedIn).toBe(true);
        expect(res.body.message).toMatch(/already scanned/i);
    });

    it('rejects invalid ticket tokens', async () => {
        const res = await request(app)
            .post('/api/bookings/verify-ticket')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ token: 'not-a-valid-jwt' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid/i);
    });
});
