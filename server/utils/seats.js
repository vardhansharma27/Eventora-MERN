const mongoose = require('mongoose');
const Event = require('../models/Event');

class SeatError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const withTransaction = async (fn) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

const reserveSeat = async (eventId, session) => {
    const event = await Event.findOneAndUpdate(
        { _id: eventId, availableSeats: { $gt: 0 } },
        { $inc: { availableSeats: -1 } },
        { session, new: true }
    );
    if (!event) {
        throw new SeatError('No seats available');
    }
    return event;
};

const releaseSeat = async (eventId, session) => {
    const event = await Event.findOneAndUpdate(
        { _id: eventId, $expr: { $lt: ['$availableSeats', '$totalSeats'] } },
        { $inc: { availableSeats: 1 } },
        { session, new: true }
    );
    return event;
};

const ensureSeatAvailableForFreeBooking = async (eventId, session) => {
    const Booking = require('../models/Booking');
    const event = await Event.findById(eventId).session(session);
    if (!event) {
        throw new SeatError('Event not found', 404);
    }
    const queuedCount = await Booking.countDocuments({
        eventId,
        status: { $in: ['pending', 'confirmed'] }
    }).session(session);
    if (queuedCount >= event.totalSeats) {
        throw new SeatError('No seats available');
    }
    return event;
};

module.exports = {
    SeatError,
    withTransaction,
    reserveSeat,
    releaseSeat,
    ensureSeatAvailableForFreeBooking
};
