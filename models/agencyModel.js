const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema para Agências:
 * - nome: nome da agência (obrigatório)
 * - manager: usuário responsável (obrigatório)
 * - diretores: array de usuários que são diretores da agência (opcional)
 * - departamentos: array de referências aos departamentos da agência (opcional)
 * - employees: array de usuários que trabalham na agência (opcional)
 * - status: status da agência (ex.: "ativo", "inativo")
 * - timestamps: campos createdAt e updatedAt gerados automaticamente
 */
const agencySchema = new Schema({
  nome: {
    type: String,
    required: [true, 'O campo "nome" é obrigatório.'],
    trim: true
  },
  manager: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'O campo "manager" é obrigatório.']
  },
  diretores: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  departamentos: [{
    type: Schema.Types.ObjectId,
    ref: 'Department',
    default: []
  }],
  employees: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  status: {
    type: String,
    default: 'ativo'
  }
}, { timestamps: true });

const Agency = mongoose.model('Agency', agencySchema);

module.exports = { Agency };
