const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema para Análise de CV:
 * - candidato: referência ao modelo de candidato/contato (opcional)
 * - dono: usuário que criou o registro do CV
 * - departamentoDono: departamento do usuário que criou o registro
 * - analise: texto descritivo da análise
 * - pontuacao: pontuação numérica do CV
 * - classificacao: classificação qualitativa (ex.: "Interessante", "Não se adequa", etc.)
 * - status: status do CV (ex.: "Não contactado", "Em análise", "Rejeitado", etc.)
 * - analisadoPor: referência ao usuário que realizou a análise
 * - dataAnalise: data em que a análise foi feita
 * - atualizadoEm: data da última atualização no registro
 * - timestamps: campos createdAt e updatedAt gerados automaticamente
 */
const cvAnalysisSchema = new Schema({
  candidato: {
    type: Schema.Types.ObjectId,
    ref: 'Contact' // Ajuste para o nome do seu modelo de candidatos, se necessário
  },
  dono: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departamentoDono: {
    type: String,
    required: true
  },
  analise: {
    type: String,
    required: [true, 'O campo "analise" é obrigatório.']
  },
  pontuacao: {
    type: Number
  },
  classificacao: {
    type: String
  },
  status: {
    type: String,
    default: 'Em análise'
  },
  analisadoPor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  dataAnalise: {
    type: Date
  },
  atualizadoEm: {
    type: Date
  }
}, { timestamps: true });

// Middleware para atualizar 'atualizadoEm' sempre que o documento for salvo
cvAnalysisSchema.pre('save', function (next) {
  this.atualizadoEm = new Date();
  next();
});

const CVAnalysis = mongoose.model('CVAnalysis', cvAnalysisSchema);

module.exports = { CVAnalysis };
