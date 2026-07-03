const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const isEmailConfigured = () =>
    Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
});

const sendMail = async (mailOptions) => {
    if (!isEmailConfigured()) {
        console.error('Email not configured: EMAIL_USER and EMAIL_PASS are required');
        return false;
    }
    try {
        await transporter.sendMail({
            from: `"Eventora" <${process.env.EMAIL_USER}>`,
            ...mailOptions
        });
        return true;
    } catch (error) {
        console.error('Email send failed:', error.message);
        return false;
    }
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    const sent = await sendMail({
        to: userEmail,
        subject: `Booking Confirmed: ${eventTitle}`,
        html: `
            <h2>Hi ${userName}!</h2>
            <p>Your booking for the event <strong>${eventTitle}</strong> is successfully confirmed.</p>
            <p>Thank you for choosing Eventora.</p>
        `
    });
    if (sent) console.log('Booking email sent to', userEmail);
    return sent;
};

const sendOTPEmail = async (userEmail, otp, type) => {
    const title = type === 'account_verification'
        ? 'Verify your Eventora Account'
        : 'Eventora Booking Verification';
    const msg = type === 'account_verification'
        ? 'Please use the following OTP to verify your new Eventora account.'
        : 'Please use the following OTP to verify and confirm your event booking.';

    const sent = await sendMail({
        to: userEmail,
        subject: title,
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2 style="color: #111;">${title}</h2>
                <p style="color: #555; font-size: 16px;">${msg}</p>
                <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; background: #f4f4f4; width: max-content; letter-spacing: 5px;">
                    ${otp}
                </div>
                <p style="color: #999; font-size: 12px;">This code expires in 5 minutes.</p>
            </div>
        `
    });

    if (sent) {
        console.log(`OTP email sent to ${userEmail} for ${type}`);
    } else {
        console.error(`OTP email FAILED for ${userEmail} — check EMAIL_USER/EMAIL_PASS on server`);
    }
    return sent;
};

module.exports = { sendBookingEmail, sendOTPEmail, isEmailConfigured };
