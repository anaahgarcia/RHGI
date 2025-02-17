const express = require('express');
const router = express.Router();
const agencyController = require('../controllers/agencyController');
const { verifyToken } = require('../middleware'); // Middleware de autenticação

// Todas as rotas exigem que o usuário esteja autenticado
router.use(verifyToken);

// Rota para criar uma nova agência (somente Admin e Manager podem criar)
router.post('/', agencyController.criarAgencia);

// Rota para listar todas as agências (todos os usuários podem visualizar)
router.get('/', agencyController.listarAgencias);

// Rota para obter os detalhes de uma agência específica
router.get('/:id', agencyController.obterAgencia);

// Rota para atualizar uma agência (somente Admin e Manager podem atualizar)
router.put('/:id', agencyController.atualizarAgencia);

// Rota para excluir (inativar) uma agência (somente Admin e Manager podem excluir)
router.delete('/:id', agencyController.deletarAgencia);

module.exports = router;
