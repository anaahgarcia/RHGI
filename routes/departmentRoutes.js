// departmentRoutes.js
const express = require('express');
const router = express.Router();
const DepartmentController = require('../controllers/departmentController');
const { verifyToken, verifyRole } = require('../middleware');

// Middleware de autenticação e verificação de role
router.use(verifyToken);
router.use(verifyRole(['Admin', 'Manager']));

// CRUD routes
router.post('/', DepartmentController.createDepartment);
router.get('/', DepartmentController.getDepartments);
router.put('/:id', DepartmentController.updateDepartment);
router.delete('/:id', DepartmentController.inactivateDepartment);

module.exports = router;