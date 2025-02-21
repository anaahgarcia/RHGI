// departmentRoutes.js
const express = require('express');
const router = express.Router();
const DepartmentController = require('../controllers/departmentController');
const { verifyToken, verifyRole } = require('../middleware');

// Middleware de autenticação para todas as rotas
router.use(verifyToken);

// Rota para listar departamentos - qualquer usuário autenticado pode acessar
router.get('/', DepartmentController.getDepartments);
// Rota para obter um departamento específico - qualquer usuário autenticado pode acessar
router.get('/:id', DepartmentController.getDepartmentById);

// Middleware de verificação de role para rotas que requerem Admin ou Manager
const adminManagerOnly = verifyRole(['Admin', 'Manager']);

// CRUD routes - apenas Admin e Manager
router.post('/', adminManagerOnly, DepartmentController.createDepartment);
router.put('/:id', adminManagerOnly, DepartmentController.updateDepartment);
router.delete('/:id', adminManagerOnly, DepartmentController.inactivateDepartment);
router.put('/:id/reactivate', adminManagerOnly, DepartmentController.reactivateDepartment);

module.exports = router;