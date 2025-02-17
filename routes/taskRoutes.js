const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { verifyToken } = require('../middleware'); // Middleware de autenticação

// Todas as rotas exigem que o usuário esteja autenticado
router.use(verifyToken);

// Rota para criar uma nova tarefa
router.post('/', taskController.criarTarefa);

// Rota para obter todas as tarefas (com filtros conforme permissões)
router.get('/', taskController.obterTarefas);

// Rota para obter uma tarefa específica pelo ID
router.get('/:id', taskController.obterTarefa);

// Rota para atualizar uma tarefa existente
router.put('/:id', taskController.atualizarTarefa);

// Rota para deletar (ou inativar) uma tarefa
router.delete('/:id', taskController.deletarTarefa);

module.exports = router;
