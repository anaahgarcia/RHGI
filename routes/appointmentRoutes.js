const express = require('express');
const router = express.Router();
const AppointmentController = require('../controllers/appointmentController');
const { verifyToken } = require('../middleware');
const { Appointment } = require('../models/appointmentModel');

// Middleware de autenticação para todas as rotas
router.use(verifyToken);

// Rotas específicas que NÃO conflitam com o parâmetro :id
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let query = { data: today };

    // Agora, todos os usuários podem ver os compromissos de hoje
    const appointments = await Appointment.find(query)
      .populate('organizador', 'nome email')
      .populate('participantes', 'nome email')
      .sort({ horario: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/period/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;

    let query = {
      data: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Todos os usuários podem ver compromissos em determinado período
    const appointments = await Appointment.find(query)
      .populate('organizador', 'nome email')
      .populate('participantes', 'nome email')
      .sort({ data: 1, horario: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rotas CRUD básicas
router.post('/', AppointmentController.createAppointment);
router.get('/', AppointmentController.getAppointments);

// Rota para buscar compromisso específico (sem restrição de acesso)
router.get('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('organizador', 'nome email')
      .populate('participantes', 'nome email');

    if (!appointment) {
      return res.status(404).json({ error: 'Compromisso não encontrado' });
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para atualizar compromisso
// Mantém a regra de que somente o organizador pode atualizar o compromisso (essa regra pode ser ajustada se necessário)
router.put('/:id', AppointmentController.updateAppointment);

// Rota para cancelar compromisso
// Mantém a regra de que somente o organizador pode cancelar o compromisso (essa regra pode ser ajustada se necessário)
router.put('/:id/cancel', AppointmentController.cancelAppointment);

// Rota para adicionar participante (qualquer usuário pode adicionar participantes)
router.post('/:id/participants', async (req, res) => {
  try {
    const { userId } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Compromisso não encontrado' });
    }

    await appointment.addParticipant(userId);
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para remover participante (qualquer usuário pode remover participantes)
router.delete('/:id/participants/:userId', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Compromisso não encontrado' });
    }

    await appointment.removeParticipant(req.params.userId);
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
