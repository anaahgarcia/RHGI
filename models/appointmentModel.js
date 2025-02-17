const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const appointmentSchema = new Schema({
  titulo: {
    type: String,
    required: true,
    trim: true,
    minlength: 3
  },
  descricao: {
    type: String,
    trim: true
  },
  data: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: 'Data deve estar no formato YYYY-MM-DD'
    }
  },
  horario: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Horário deve estar no formato HH:mm'
    }
  },
  participantes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  tipo: {
    type: String,
    required: true,
    enum: ['entrevista', 'reuniao', 'treinamento', 'outro'],
    default: 'outro'
  },
  local: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pendente', 'confirmado', 'cancelado'],
    default: 'pendente'
  },
  organizador: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  googleCalendarEventId: {
    type: String
  },
  historico: [{
    tipo: {
      type: String,
      required: true,
      enum: ['criacao', 'atualizacao', 'cancelamento']
    },
    data: {
      type: Date,
      default: Date.now
    },
    autor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }]
}, {
  timestamps: true
});

// Índices
appointmentSchema.index({ data: 1, horario: 1 });
appointmentSchema.index({ organizador: 1 });
appointmentSchema.index({ participantes: 1 });
appointmentSchema.index({ status: 1 });

// Middleware pre-save para validação de datas
appointmentSchema.pre('save', function(next) {
  const appointmentDate = new Date(`${this.data}T${this.horario}`);
  if (appointmentDate < new Date()) {
    return next(new Error('Não é possível criar compromissos com data/hora no passado'));
  }
  next();
});

// Métodos do modelo
appointmentSchema.methods = {
  // Método para verificar se um usuário é participante ou organizador (pode ser usado para outras lógicas, se necessário)
  isParticipant(userId) {
    return this.participantes.some(p => p.toString() === userId.toString()) ||
           this.organizador.toString() === userId.toString();
  },

  // Adiciona um participante
  async addParticipant(userId) {
    if (!this.participantes.includes(userId)) {
      this.participantes.push(userId);
      return this.save();
    }
    return this;
  },

  // Remove um participante
  async removeParticipant(userId) {
    this.participantes = this.participantes.filter(p =>
      p.toString() !== userId.toString()
    );
    return this.save();
  }
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = { Appointment };
