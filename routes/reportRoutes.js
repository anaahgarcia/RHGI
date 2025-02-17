const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken } = require('../middleware'); // Ajuste conforme sua configuração

// Todas as rotas exigem autenticação
router.use(verifyToken);

// Rota para obter as métricas do dashboard (filtráveis por semana, mês ou ano – padrão: semana)
router.get('/dashboard', reportController.getDashboard);

// Rota para obter os dados do funil de conversão (filtráveis por semana, mês ou ano)
router.get('/funnel', reportController.getFunnel);

// Rota para obter o ranking mensal (filtrável por mês e ano – padrão: mês atual)
router.get('/rankings', reportController.getRankings);

// Rota para atualização manual de métricas (somente Admin pode alterar)
router.put('/metrics', reportController.atualizarMetricas);

module.exports = router;
