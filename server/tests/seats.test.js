const Event = require('../models/Event');
const Booking = require('../models/Booking');
const {
    withTransaction,
    reserveSeat,
    releaseSeat,
    ensureSeatAvailableForFreeBooking,
    SeatError
} = require('../utils/seats');
const { createUser, createEvent } = require('./helpers');

describe('Seat utilities', () => {
    let admin;
    let event;

    beforeEach(async () => {
        ({ user: admin } = await createUser({ email: 'seat-admin@test.com', role: 'admin' }));
        event = await createEvent(admin._id, { totalSeats: 2, availableSeats: 2 });
    });

    it('reserveSeat decrements available seats atomically', async () => {
        await withTransaction(async (session) => {
            const updated = await reserveSeat(event._id, session);
            expect(updated.availableSeats).toBe(1);
        });

        const stored = await Event.findById(event._id);
        expect(stored.availableSeats).toBe(1);
    });

    it('reserveSeat throws when no seats remain', async () => {
        await withTransaction(async (session) => {
            await reserveSeat(event._id, session);
            await reserveSeat(event._id, session);
        });

        await expect(
            withTransaction((session) => reserveSeat(event._id, session))
        ).rejects.toThrow(SeatError);
    });

    it('only allows as many concurrent reservations as available seats', async () => {
        const singleSeatEvent = await createEvent(admin._id, {
            title: 'Single Seat',
            totalSeats: 1,
            availableSeats: 1
        });

        const results = await Promise.allSettled([
            withTransaction((session) => reserveSeat(singleSeatEvent._id, session)),
            withTransaction((session) => reserveSeat(singleSeatEvent._id, session))
        ]);

        const successes = results.filter((r) => r.status === 'fulfilled');
        const failures = results.filter((r) => r.status === 'rejected');

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);

        const stored = await Event.findById(singleSeatEvent._id);
        expect(stored.availableSeats).toBe(0);
    });

    it('releaseSeat restores a seat up to totalSeats', async () => {
        await withTransaction(async (session) => {
            await reserveSeat(event._id, session);
            const restored = await releaseSeat(event._id, session);
            expect(restored.availableSeats).toBe(2);
        });
    });

    it('ensureSeatAvailableForFreeBooking blocks when queue is full', async () => {
        const { user: u1 } = await createUser({ email: 'u1@test.com' });
        const { user: u2 } = await createUser({ email: 'u2@test.com' });

        await Booking.create({ userId: u1._id, eventId: event._id, status: 'pending', amount: 0 });
        await Booking.create({ userId: u2._id, eventId: event._id, status: 'pending', amount: 0 });

        await expect(
            withTransaction((session) => ensureSeatAvailableForFreeBooking(event._id, session))
        ).rejects.toThrow(SeatError);
    });

    it('ensureSeatAvailableForFreeBooking allows booking when capacity remains', async () => {
        const { user: u1 } = await createUser({ email: 'u3@test.com' });
        await Booking.create({ userId: u1._id, eventId: event._id, status: 'pending', amount: 0 });

        await expect(
            withTransaction((session) => ensureSeatAvailableForFreeBooking(event._id, session))
        ).resolves.toBeTruthy();
    });
});
