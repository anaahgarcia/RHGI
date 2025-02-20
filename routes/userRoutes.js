const express = require('express');
const router = express.Router();
const { UserController, upload } = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware');

// Rotas que não requerem autenticação
router.post('/register-first-admin', UserController.createFirstAdmin);
router.post('/login', UserController.login);

// Middleware de autenticação para todas as rotas abaixo
router.use(verifyToken);

// Rota de logout (requer autenticação)
router.post('/logout', UserController.logout);


// Middleware de autenticação para todas as rotas abaixo
router.use(verifyToken);

// Rotas de usuário - CRUD básico
router.post('/register',
    verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial',
        'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações',
        'Diretor Financeiro', 'Diretor Jurídico', 'Recrutador',
        'Broker de Equipa', 'Consultor', 'Employee']),
    UserController.registerUser
);

// Rotas de consulta
router.get('/', UserController.getUsuarios);
router.get('/:id', UserController.getUsuario);

// Rota para reativar usuário
router.put('/:id/reactivate',
    verifyRole(['Admin', 'Manager']),
    UserController.reativarUsuario
);


// Rota específica para alteração de senha (qualquer usuário pode alterar sua própria senha)
router.put('/:id/change-password', UserController.changePassword);

// Rotas de atualização
router.put('/:id',
    verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial',
        'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações',
        'Diretor Financeiro', 'Diretor Jurídico', 'Recrutador']),
    UserController.update
);

// Rota de inativação
router.put('/:id/inactivate',
    verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial',
        'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações',
        'Diretor Financeiro', 'Diretor Jurídico', 'Recrutador']),
    UserController.inativarUsuario
);

// Rota de foto - usando o middleware de upload configurado no controller
router.put('/:id/photo', upload.single('photo'), UserController.atualizarFoto);

module.exports = router;