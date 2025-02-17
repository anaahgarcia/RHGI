const express = require('express');
const router = express.Router();
const cvAnalysisController = require('../controllers/cvAnalysisController');
const { verifyToken } = require('../middleware'); // Ajuste conforme sua configuração de autenticação

// Middleware de autenticação: todas as rotas exigem que o usuário esteja autenticado
router.use(verifyToken);

// Rota para criar uma nova análise de CV
router.post('/', cvAnalysisController.criarAnalise);

// Rota para obter todas as análises de CV (filtradas de acordo com as permissões do usuário)
router.get('/', cvAnalysisController.obterTodasAnalises);

// Rota para obter uma análise de CV específica
router.get('/:id', cvAnalysisController.obterAnalise);

// Rota para atualizar uma análise de CV
router.put('/:id', cvAnalysisController.atualizarAnalise);

// Rota para "deletar" (ou inativar) uma análise de CV
router.delete('/:id', cvAnalysisController.deletarAnalise);

module.exports = router;
 