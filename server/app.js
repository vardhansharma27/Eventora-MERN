const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const { handleWebhook } = require('./controllers/paymentController');

const app = express();

app.use(cors());
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleWebhook);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);

module.exports = app;
