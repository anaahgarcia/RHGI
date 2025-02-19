require('dotenv').config(); // Carregar as variáveis do .env
const jwt = require('jsonwebtoken');
const { User } = require('./models/userModel');

const SECRET_KEY = process.env.JWT_SECRET || "chave_super_secreta_do_jwt";

// 🚨 Se `SECRET_KEY` não estiver definido, o servidor não inicia
if (!process.env.JWT_SECRET) {
    console.error("⚠️ SECRET_KEY is not defined in the .env file. Server cannot start.");
    process.exit(1);
}

const handleError = (res, status, message) => {
    return res.status(status).json({ error: message });
};

// ✅ Middleware para verificar o token JWT
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return handleError(res, 403, 'Invalid or missing authorization header');
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, SECRET_KEY, (err, decodedUser) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return handleError(res, 401, 'Token expired');
            }
            return handleError(res, 403, 'Invalid token');
        }

        console.log("Decoded User:", decodedUser);

        if (!decodedUser.id) {
            return handleError(res, 403, 'Invalid token structure: missing user ID');
        }

        req.user = decodedUser;
        next();
    });
};

// ✅ Middleware para verificar a role do usuário
const verifyRole = (roles) => {
    return (req, res, next) => {
        console.log("User in verifyRole:", req.user);

        // 🚨 Admin tem acesso irrestrito, então pode passar direto
        if (req.user.role === "Admin") {
            return next();
        }

        if (!req.user.role || !roles.includes(req.user.role)) {
            return handleError(res, 403, 'You do not have the necessary permissions');
        }

        next();
    };
};

// ✅ Middleware para verificar acesso a uma agência específica
const verifyAgencyAccess = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return handleError(res, 403, 'User ID is missing from token');
        }

        const userId = req.user.id;
        const agencyId = req.params.agencyId || req.body.agencyId;

        const user = await User.findById(userId).populate('agencias');

        if (!user) {
            return handleError(res, 404, 'User not found');
        }

        // 🚨 Se for Admin, pode acessar qualquer agência
        if (user.role === "Admin") {
            return next();
        }

        // Verificar se usuário tem acesso à agência
        const hasAccess = user.agencias.some(
            agency => agency._id.toString() === agencyId && agency.status === 'ativo'
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
