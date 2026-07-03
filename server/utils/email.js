const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const getEmailProvider = () => {
    if (process.env.BREVO_SMTP_KEY && process.env.BREVO_SMTP_USER) return 'brevo';
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) return 'gmail';
    return null;
};

const isEmailConfigured = () => Boolean(getEmailProvider());

const createTransporter = () => {
    const provider = getEmailProvider();
    if (provider === 'brevo') {
        const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
        if (!senderEmail) {
            console.error('Brevo requires BREVO_SENDER_EMAIL — a verified personal email in Brevo (not the @smtp-brevo.com login).');
            return null;
        }
        return {
            provider,
            from: `"Eventora" <${senderEmail}>`,
            transport: nodemailer.createTransport({
                host: 'smtp-relay.brevo.com',
                port: 587,
                secure: false,
                requireTLS: true,
                auth: {
                    user: process.env.BREVO_SMTP_USER,
                    pass: process.env.BREVO_SMTP_KEY
                },
                connectionTimeout: 15000,
                greetingTimeout: 15000,
                socketTimeout: 20000
            })
        };
    }
    if (provider === 'gmail') {
        return {
            provider,
            from: `"Eventora" <${process.env.EMAIL_USER}>`,
            transport: nodemailer.createTransport({
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
            })
        };
    }
    return null;
};

const sendMail = async (mailOptions) => {
    const config = createTransporter();
    if (!config) {
        console.error('Email not configured. Set BREVO_SMTP_* (production) or EMAIL_USER/PASS (local Gmail).');
        return false;
    }
    try {
        await config.transport.sendMail({
            from: config.from,
            ...mailOptions
        });
        console.log(`Email sent via ${config.provider} to ${mailOptions.to}`);
        return true;
    } catch (error) {
        console.error(`Email send failed (${config.provider}):`, error.message);
        if (error.response) console.error('SMTP response:', error.response);
        return false;
    }
};

const getEmailStatus = () => {
    const provider = getEmailProvider();
    const senderEmail = provider === 'brevo'
        ? (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || '')
        : (process.env.EMAIL_USER || '');
    return {
        provider: provider || 'none',
        configured: Boolean(provider),
        senderEmail: senderEmail || 'missing',
        brevoSmtpUserSet: Boolean(process.env.BREVO_SMTP_USER),
        brevoSmtpKeySet: Boolean(process.env.BREVO_SMTP_KEY),
        brevoSenderSet: Boolean(process.env.BREVO_SENDER_EMAIL)
    };
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

    if (!sent) {
        console.error(`[OTP-FALLBACK] Could not email ${userEmail}. OTP for ${type}: ${otp}`);
    }
    return sent;
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    return sendMail({
        to: userEmail,
        subject: `Booking Confirmed: ${eventTitle}`,
        html: `
            <h2>Hi ${userName}!</h2>
            <p>Your booking for the event <strong>${eventTitle}</strong> is successfully confirmed.</p>
            <p>Thank you for choosing Eventora.</p>
        `
    });
};

module.exports = { sendBookingEmail, sendOTPEmail, isEmailConfigured, getEmailProvider, getEmailStatus };
