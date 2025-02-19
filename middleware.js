const jwt = require('jsonwebtoken');
const { User } = require('./models/userModel');

// Definir a chave secreta como uma constante
const SECRET_KEY = "chave_super_secreta_do_jwt";

const handleError = (res, status, message) => {
    return res.status(status).json({ error: message });
};

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

        req.user = decodedUser;
        next();
    });
};

const verifyRole = (roles) => {
    return (req, res, next) => {
        // Admin tem acesso irrestrito
        if (req.user.role === "Admin") {
            return next();
        }

        if (!req.user.role || !roles.includes(req.user.role)) {
            return handleError(res, 403, 'You do not have the necessary permissions');
        }

        next();
    };
};

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

        // Se for Admin, pode acessar qualquer agência
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

// Exportar tudo o que precisamos, incluindo a SECRET_KEY
module.exports = { 
    verifyToken, 
    verifyRole, 
    verifyAgencyAccess,
    SECRET_KEY  // Exportar a chave para usar em outros arquivos
};