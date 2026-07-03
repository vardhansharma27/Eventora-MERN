require('dotenv').config();
const { sendOTPEmail, isEmailConfigured, getEmailProvider } = require('../utils/email');

(async () => {
    console.log('Provider:', getEmailProvider() || 'none');
    console.log('Email configured:', isEmailConfigured());

    if (!isEmailConfigured()) {
        console.error('FAIL: Set BREVO_SMTP_* or EMAIL_USER/EMAIL_PASS in server/.env');
        process.exit(1);
    }

    const to = process.env.EMAIL_USER || process.env.BREVO_SMTP_USER;
    console.log(`Sending test OTP to ${to}...`);
    const sent = await sendOTPEmail(to, '123456', 'account_verification');
    console.log(sent ? 'SUCCESS: Check your inbox (and spam).' : 'FAIL: See error above.');
    process.exit(sent ? 0 : 1);
})();
