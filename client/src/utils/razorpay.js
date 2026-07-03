export const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if (window.Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

export const openRazorpayCheckout = ({ orderId, amount, currency, keyId, user, bookingId, onSuccess, onFailure }) => {
    const options = {
        key: keyId,
        amount,
        currency,
        name: 'Eventora',
        description: 'Event ticket booking',
        order_id: orderId,
        prefill: {
            name: user?.name || '',
            email: user?.email || ''
        },
        theme: { color: '#111827' },
        handler: (response) => {
            onSuccess({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                bookingId
            });
        },
        modal: {
            ondismiss: () => onFailure('Payment cancelled')
        }
    };

    const razorpay = new window.Razorpay(options);
    razorpay.on('payment.failed', (response) => {
        onFailure(response.error?.description || 'Payment failed');
    });
    razorpay.open();
};
