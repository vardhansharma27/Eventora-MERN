process.env.JWT_SECRET = 'test-jwt-secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret';

jest.mock('../utils/email', () => ({
    sendOTPEmail: jest.fn().mockResolvedValue(true),
    sendBookingEmail: jest.fn().mockResolvedValue(true),
    isEmailConfigured: jest.fn().mockReturnValue(true),
    getEmailProvider: jest.fn().mockReturnValue('test')
}));

jest.mock('../utils/razorpay', () => ({
    getRazorpayInstance: jest.fn(() => ({
        orders: {
            create: jest.fn().mockResolvedValue({
                id: 'order_test_abc',
                amount: 50000,
                currency: 'INR'
            })
        }
    }))
}));

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
});

beforeEach(async () => {
    const { collections } = mongoose.connection;
    for (const collection of Object.values(collections)) {
        await collection.deleteMany({});
    }
});
