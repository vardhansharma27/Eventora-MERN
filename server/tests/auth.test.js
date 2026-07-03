const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const OTP = require('../models/OTP');

describe('Auth API', () => {
    describe('POST /api/auth/register', () => {
        it('creates a user and stores verification OTP', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ name: 'Alice', email: 'alice@test.com', password: 'password123' });

            expect(res.status).toBe(201);
            expect(res.body.message).toMatch(/OTP sent/i);
            expect(res.body.email).toBe('alice@test.com');

            const user = await User.findOne({ email: 'alice@test.com' });
            expect(user).toBeTruthy();
            expect(user.isVerified).toBe(false);
            expect(user.role).toBe('user');

            const otp = await OTP.findOne({ email: 'alice@test.com', action: 'account_verification' });
            expect(otp).toBeTruthy();
        });

        it('rejects duplicate email', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ name: 'Alice', email: 'dup@test.com', password: 'password123' });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ name: 'Bob', email: 'dup@test.com', password: 'password456' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/already exists/i);
        });
    });

    describe('POST /api/auth/verify-otp', () => {
        it('verifies account and returns JWT', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ name: 'Bob', email: 'bob@test.com', password: 'password123' });

            const stored = await OTP.findOne({ email: 'bob@test.com', action: 'account_verification' });

            const res = await request(app)
                .post('/api/auth/verify-otp')
                .send({ email: 'bob@test.com', otp: stored.otp });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeTruthy();
            expect(res.body.email).toBe('bob@test.com');

            const user = await User.findOne({ email: 'bob@test.com' });
            expect(user.isVerified).toBe(true);
        });

        it('rejects invalid OTP', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ name: 'Carol', email: 'carol@test.com', password: 'password123' });

            const res = await request(app)
                .post('/api/auth/verify-otp')
                .send({ email: 'carol@test.com', otp: '000000' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/invalid/i);
        });
    });

    describe('POST /api/auth/login', () => {
        it('logs in a verified user', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ name: 'Dave', email: 'dave@test.com', password: 'password123' });

            const stored = await OTP.findOne({ email: 'dave@test.com', action: 'account_verification' });
            await request(app)
                .post('/api/auth/verify-otp')
                .send({ email: 'dave@test.com', otp: stored.otp });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'dave@test.com', password: 'password123' });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeTruthy();
            expect(res.body.email).toBe('dave@test.com');
        });

        it('rejects wrong password', async () => {
            const { createUser } = require('./helpers');
            await createUser({ email: 'eve@test.com' });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'eve@test.com', password: 'wrongpassword' });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/invalid credentials/i);
        });

        it('blocks unverified users', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ name: 'Frank', email: 'frank@test.com', password: 'password123' });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'frank@test.com', password: 'password123' });

            expect(res.status).toBe(403);
            expect(res.body.needsVerification).toBe(true);
        });
    });
});
