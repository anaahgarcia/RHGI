const jwt = require('jsonwebtoken');
const { User } = require('./models/userModel');
const { securekey } = require('./secret.key');
const cors = require('cors');
require('dotenv').config();

const handleError = (res, status, message) => {
    return res.status(status).json({ error: message });
};

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return handleError(res, 403, 'Invalid or missing authorization header');
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, securekey, (err, decodedUser) => { 
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return handleError(res, 401, 'Token expired');
            }
            return handleError(res, 403, 'Invalid token');
        }
        
        decodedUser._id = decodedUser.id;
        req.user = decodedUser;
        console.log(`Token verified. User: ${JSON.stringify(req.user)}`);
        next();
    });
};

const verifyRole = (roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole) {
            return handleError(res, 403, 'User role is missing from token');
        }

        if (!roles.includes(userRole)) {
            return handleError(res, 403, 'You do not have the necessary permissions');
        }

        next();
    };
};

const verifyAgencyAccess = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const agencyId = req.params.agencyId || req.body.agencyId;

        if (!userId) {
            return handleError(res, 403, 'User ID is missing from token');
        }

        const user = await User.findById(userId).populate('agencias');

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        // Admin e Manager tem acesso total
        if (['Admin', 'Manager'].includes(user.role)) {
            return next();
        }

        // Verificar se usuário tem acesso à agência
        const hasAccess = user.agencias.some(
            agency => agency._id.toString() === agencyId && 
            agency.status === 'ativo'
        );

        if (!hasAccess) {
            return handleError(res, 403, 'You do not have access to this agency');
        }

        next();
    } catch (error) {
        console.error('Error verifying agency access:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

module.exports = { 
    verifyToken, 
    verifyRole, 
    verifyAgencyAccess 
};