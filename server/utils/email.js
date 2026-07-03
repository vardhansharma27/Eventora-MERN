const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const getSenderEmail = () =>
    process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || '';

const getEmailProvider = () => {
    if (process.env.BREVO_API_KEY && getSenderEmail()) return 'brevo-api';
    if (process.env.BREVO_SMTP_KEY && process.env.BREVO_SMTP_USER && getSenderEmail()) return 'brevo-smtp';
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) return 'gmail';
    return null;
};

const isEmailConfigured = () => Boolean(getEmailProvider());

const sendViaBrevoApi = async ({ to, subject, html }) => {
    const senderEmail = getSenderEmail();
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'Eventora', email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Brevo API status ${response.status}`);
    }
    return true;
};

const createSmtpTransporter = (provider) => {
    const senderEmail = getSenderEmail();
    if (provider === 'brevo-smtp') {
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
    return {
        provider: 'gmail',
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
};

const sendMail = async ({ to, subject, html }) => {
    const provider = getEmailProvider();
    if (!provider) {
        console.error('Email not configured. Set BREVO_API_KEY + BREVO_SENDER_EMAIL (Render) or EMAIL_USER/PASS (local).');
        return false;
    }

    try {
        if (provider === 'brevo-api') {
            await sendViaBrevoApi({ to, subject, html });
            console.log(`Email sent via brevo-api to ${to}`);
            return true;
        }

        const config = createSmtpTransporter(provider);
        await config.transport.sendMail({ from: config.from, to, subject, html });
        console.log(`Email sent via ${config.provider} to ${to}`);
        return true;
    } catch (error) {
        console.error(`Email send failed (${provider}):`, error.message);
        return false;
    }
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

const getEmailStatus = () => {
    const provider = getEmailProvider();
    return {
        provider: provider || 'none',
        configured: Boolean(provider),
        senderEmail: getSenderEmail() || 'missing',
        brevoApiKeySet: Boolean(process.env.BREVO_API_KEY),
        brevoSmtpUserSet: Boolean(process.env.BREVO_SMTP_USER),
        brevoSmtpKeySet: Boolean(process.env.BREVO_SMTP_KEY),
        brevoSenderSet: Boolean(process.env.BREVO_SENDER_EMAIL)
    };
};

module.exports = { sendBookingEmail, sendOTPEmail, isEmailConfigured, getEmailProvider, getEmailStatus };
