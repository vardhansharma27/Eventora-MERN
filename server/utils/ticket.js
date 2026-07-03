const jwt = require('jsonwebtoken');

const generateTicketToken = (booking) => {
    return jwt.sign(
        {
            bid: booking._id.toString(),
            uid: booking.userId.toString(),
            eid: booking.eventId.toString()
        },
        process.env.JWT_SECRET,
        { expiresIn: '90d' }
    );
};

const verifyTicketToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateTicketToken, verifyTicketToken };
