const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema para Relatórios (Reports):
 * - user: usuário que gerou ou a quem o relatório se refere
 * - tipo: tipo do relatório (dashboard, funnel, ranking ou metrics)
 * - periodo: período de referência (ex.: "semana", "mes", "ano" ou "3-2025")
 * - dataInicio: data de início do período
 * - dataFim: data de fim do período
 * - dados: objeto que armazena os dados agregados (pode ser um objeto livre)
 * - geradoEm: data e hora em que o relatório foi gerado
 */
const reportSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tipo: {
    type: String,
    enum: ['dashboard', 'funnel', 'ranking', 'metrics'],
    required: true
  },
  periodo: {
    type: String,
    required: true
  },
  dataInicio: {
    type: Date,
    required: true
  },
  dataFim: {
    type: Date,
    required: true
  },
  dados: {
    type: Schema.Types.Mixed,
    required: true
  },
  geradoEm: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);

module.exports = { Report };
