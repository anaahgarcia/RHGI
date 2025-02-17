const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSchema = new Schema({
  titulo: {
    type: String,
    required: [true, 'O campo "título" é obrigatório.'],
    trim: true
  },
  descricao: {
    type: String,
    required: [true, 'O campo "descrição" é obrigatório.'],
    trim: true
  },
  data: {
    type: Date,
    required: true,
    default: Date.now
  },
  prazo: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    default: 'Pendente'
  },
  criador: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  destinatario: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  responsaveis: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  acompanhantes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  departamento: {
    type: String,
    default: null
  },
  atualizadoEm: {
    type: Date
  }
}, { timestamps: true });

// Middleware para atualizar o campo 'atualizadoEm' sempre que o documento for salvo
taskSchema.pre('save', function(next) {
  this.atualizadoEm = new Date();
  next();
});

const Task = mongoose.model('Task', taskSchema);

module.exports = { Task };
