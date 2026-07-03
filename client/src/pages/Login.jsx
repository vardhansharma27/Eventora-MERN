import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/axios';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [showOTP, setShowOTP] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [warning, setWarning] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);

    const { login, verifyOTP } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleResendOTP = async () => {
        setResending(true);
        setError('');
        try {
            const { data } = await api.post('/auth/resend-otp', { email });
            if (data.emailSent) {
                setInfo(`A new OTP was sent to ${email}. Check spam too.`);
                setWarning('');
            } else {
                setWarning('Email could not be sent. On Render, set BREVO_SMTP_USER and BREVO_SMTP_KEY.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Could not resend OTP');
        } finally {
            setResending(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setInfo('');
        setWarning('');
        try {
            if (!showOTP) {
                const data = await login(email, password);
                if (data.role === 'admin') navigate('/admin');
                else navigate('/dashboard');
            } else {
                const data = await verifyOTP(email, otp);
                if (data.role === 'admin') navigate('/admin');
                else navigate('/dashboard');
            }
        } catch (err) {
            if (err.needsVerification) {
                setShowOTP(true);
                if (err.emailSent === false) {
                    setWarning(`We could not email an OTP to ${email}. Add Brevo keys on Render, or set isVerified: true in MongoDB Atlas.`);
                } else {
                    setInfo(`Enter the OTP sent to ${email}. Check spam if needed.`);
                }
            } else {
                setError(typeof err === 'string' ? err : (err.message || 'Login failed'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Welcome Back</h2>
                <p className="text-gray-500">Sign in to your Eventora account</p>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-center border border-red-100">{error}</div>}
            {warning && <div className="bg-amber-50 text-amber-800 p-3 rounded-lg mb-4 text-center border border-amber-200 text-sm">{warning}</div>}
            {info && <div className="bg-blue-50 text-blue-700 p-3 rounded-lg mb-4 text-center border border-blue-100 text-sm">{info}</div>}

            <form onSubmit={handleSubmit} className="space-y-6">
                {!showOTP ? (
                    <>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                            <input
                                type="email"
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 focus:border-gray-700 transition shadow-sm"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                            <input
                                type="password"
                                required
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 focus:border-gray-700 transition shadow-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                            <input type="email" readOnly className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 shadow-sm" value={email} />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Verification Code (OTP)</label>
                            <input
                                type="text"
                                required
                                placeholder="6-digit code"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-gray-700 transition shadow-sm font-bold tracking-widest text-center text-lg"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength="6"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleResendOTP}
                            disabled={resending}
                            className="w-full text-sm font-semibold text-gray-700 hover:text-gray-900 underline"
                        >
                            {resending ? 'Sending...' : 'Resend OTP'}
                        </button>
                    </>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-black focus:ring-4 focus:ring-gray-200 transition shadow-md"
                >
                    {loading ? 'Processing...' : (showOTP ? 'Verify OTP & Log In' : 'Sign In')}
                </button>
            </form>

            <p className="text-center mt-8 text-gray-600">
                Don't have an account? <Link to="/register" className="text-gray-900 font-bold hover:underline">Sign up</Link>
            </p>
        </div>
    );
};

export default Login;
