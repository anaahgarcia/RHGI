const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware');
const upload = require('multer')();

// Rotas públicas (não precisam de token)
router.post('/login', UserController.login);

// Todas as rotas abaixo precisam de autenticação
router.use(verifyToken);

// Rotas de criação de usuário
router.post('/register', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 'Diretor de Marketing', 
'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico', 'Recrutador', 'Broker de Equipa']), 
UserController.registerUser);

// Rotas de consulta
router.get('/', UserController.getUsers);
router.get('/profile', UserController.getProfile);
router.get('/:id', UserController.getUserById);
router.get('/agency/:agencyId', UserController.getUsersByAgency);
router.get('/department/:department', UserController.getUsersByDepartment);
router.get('/team/:managerId', UserController.getUsersByManager);

// Rotas de atualização
router.put('/:id', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 'Diretor de Marketing', 
'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico']), 
UserController.updateUser);

router.put('/:id/inactivate', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 'Diretor de Marketing', 
'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico']), 
UserController.inativarUsuario);

router.put('/:id/photo', upload.single('photo'), UserController.atualizarFoto);
router.put('/:id/password', UserController.changePassword);

// Rotas de gestão de agências e equipes
router.post('/assign-agency', verifyRole(['Admin', 'Manager']), 
UserController.assignToAgency);

router.post('/remove-agency', verifyRole(['Admin', 'Manager']), 
UserController.removeFromAgency);

router.post('/assign-manager', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 'Diretor de Marketing', 
'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico']), 
UserController.assignToManager);

router.post('/assign-broker', verifyRole(['Admin', 'Manager', 'Diretor Comercial']), 
UserController.assignToBroker);

// Rotas de relatórios
router.get('/reports/team/:managerId', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 
'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico', 
'Broker de Equipa']), UserController.getTeamReport);

router.get('/reports/agency/:agencyId', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 
'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico']), 
UserController.getAgencyReport);

router.get('/reports/department/:department', verifyRole(['Admin', 'Manager', 'Diretor de RH', 'Diretor Comercial', 
'Diretor de Marketing', 'Diretor de Crédito', 'Diretor de Remodelações', 'Diretor Financeiro', 'Diretor Jurídico']), 
UserController.getDepartmentReport);

module.exports = router;