const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Event');
const OTP = require('../models/OTP');

const createUser = async ({ name = 'Test User', email, password = 'password123', role = 'user', isVerified = true } = {}) => {
    const resolvedEmail = email || `user_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
        name,
        email: resolvedEmail,
        password: hashedPassword,
        role,
        isVerified
    });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    return { user, token };
};

const createEvent = async (adminId, overrides = {}) => {
    return Event.create({
        title: 'Test Event',
        description: 'Test description',
        date: new Date('2026-12-01'),
        location: 'NIT Warangal',
        category: 'Tech',
        totalSeats: 2,
        availableSeats: 2,
        ticketPrice: 0,
        createdBy: adminId,
        ...overrides
    });
};

const createBookingOTP = async (email, otp = '123456') => {
    await OTP.create({ email, otp, action: 'event_booking' });
    return otp;
};

module.exports = { createUser, createEvent, createBookingOTP };
