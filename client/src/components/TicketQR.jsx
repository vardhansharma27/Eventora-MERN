import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const TicketQR = ({ token, eventTitle, attendeeName, checkedIn }) => {
    if (!token) return null;

    return (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Entry QR Ticket</p>
            <div className="inline-block p-3 bg-white rounded-lg shadow-sm border border-gray-100">
                <QRCodeSVG value={token} size={160} level="M" includeMargin />
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-3">{eventTitle}</p>
            <p className="text-xs text-gray-500">{attendeeName}</p>
            {checkedIn ? (
                <p className="text-xs font-bold text-green-600 mt-2">✓ Checked in at gate</p>
            ) : (
                <p className="text-xs text-gray-400 mt-2">Show this QR at the event entrance</p>
            )}
        </div>
    );
};

export default TicketQR;
