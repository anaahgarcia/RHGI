const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  // Informações Básicas
  nome: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  telefone: {
    type: String,
    required: true,
    trim: true
  },
  nif: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  
  // Informações Profissionais
  skills: [{
    type: String,
    trim: true
  }],
  anos_experiencia: {
    type: Number,
    min: 0
  },
  especializacao: [{
    type: String,
    trim: true
  }],
  
  // Localização
  cidade: String,
  distrito: String,
  
  // Status e Classificação
  status: {
    type: String,
    enum: ['ativo', 'inativo'],
    default: 'ativo'
  },
  
  // Usuários Responsáveis
  responsaveis: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    data_atribuicao: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['ativo', 'inativo'],
      default: 'ativo'
    }
  }],
  
  // Histórico
  historico: [{
    tipo: {
      type: String,
      enum: ['sistema', 'atualizacao', 'interacao', 'inativacao'],
      required: true
    },
    conteudo: {
      type: String,
      required: true
    },
    data: {
      type: Date,
      default: Date.now
    },
    autor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  
  // Metadados
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índices para melhor performance
contactSchema.index({ email: 1 });
contactSchema.index({ nif: 1 });
contactSchema.index({ 'responsaveis.userId': 1, 'responsaveis.status': 1 });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = { Contact };