require('dotenv').config();
const { sendOTPEmail, isEmailConfigured, getEmailProvider } = require('../utils/email');

(async () => {
    console.log('Provider:', getEmailProvider() || 'none');
    console.log('Email configured:', isEmailConfigured());

    if (!isEmailConfigured()) {
        console.error('FAIL: Set BREVO_API_KEY + BREVO_SENDER_EMAIL (production) or EMAIL_USER/EMAIL_PASS (local) in server/.env');
        process.exit(1);
    }

    const to = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
    console.log(`Sending test OTP to ${to}...`);
    const sent = await sendOTPEmail(to, '123456', 'account_verification');
    console.log(sent ? 'SUCCESS: Check your inbox (and spam).' : 'FAIL: See error above.');
    process.exit(sent ? 0 : 1);
})();
