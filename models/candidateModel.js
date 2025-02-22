const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const contactSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return v.length >= 3;
      },
      message: 'Nome deve ter pelo menos 3 caracteres.'
    }
  },

  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(v);
      },
      message: 'Email inválido.'
    }
  },

  telefone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d{9,14}$/.test(v.replace(/\D/g, ''));
      },
      message: 'Telefone inválido.'
    }
  },

  tipo_contato: {
    type: String,
    required: true,
    enum: ['Recrutamento', 'Comercial', 'Marketing', 'Financeiro', 'Crédito', 'Jurídico', 'Remodelações', 'Outro']
  },

  importancia: {
    type: String,
    required: true,
    enum: ['Baixa', 'Média', 'Alta', 'Urgente']
  },

  origem_contato: {
    type: String,
    required: true,
    enum: ['Site da imobiliária', 'LinkedIn', 'Indicação', 'Redes Sociais', 'Site de emprego', 'Olx', 'SapoEmprego', 'Placas', 'Cartões', 'Telefonou na agência', 'Outro']
  },

  // Campos de Pipeline e Status
  status: {
    type: String,
    required: true,
    enum: ['ativo', 'inativo'],
    default: 'ativo'
  },

  pipeline_status: {
    type: String,
    required: true,
    enum: ['identificacao', 'lead', 'chamada', 'agendamento', 'entrevista', 'teste_pratico', 'oferta', 'recrutado', 'inativo'],
    default: 'identificacao'
  },

  // Campos de Indicação
  indicacao: {
    type: Boolean,
    default: false
  },

  nivel_indicacao: {
    type: String,
    enum: ['baixa', 'media', 'alta'],
    required: function() { return this.indicacao; }
  },

  responsavel_indicacao: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.indicacao; }
  },

  // Campos de Localização e Experiência
  departamento: {
    type: String,
    required: true,
    enum: ['Crédito', 'Comercial', 'Marketing', 'RH', 'Remodelações', 'Financeiro', 'Jurídico', 'Outro']
  },

  agencia: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true
  },

  cidade: String,
  distrito: String,
  skills: [String],
  experiencia: { type: Number, min: 0, max: 50 },

  // Campos de Métricas e Análise
  metricas: {
    data_identificacao: Date,
    data_lead: Date,
    data_chamada: Date,
    data_agendamento: Date,
    data_entrevista: Date,
    data_teste_pratico: Date,
    data_oferta: Date,
    data_recrutamento: Date,
    data_inativacao: Date,
    tempo_identificacao: Number,
    tempo_lead: Number,
    tempo_chamada: Number,
    tempo_agendamento: Number,
    tempo_entrevista: Number,
    tempo_teste_pratico: Number,
    tempo_oferta: Number,
    tempo_recrutamento: Number,
    tempo_inativacao: Number
  },

  cv_analisado: { type: Boolean, default: false },

  responsaveis: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    data_atribuicao: { type: Date, default: Date.now },
    status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' }
  }],

  historico: [{
    tipo: { type: String, required: true, enum: ['sistema', 'atualizacao', 'interacao', 'inativacao', 'mudanca_status', 'reativacao'] },
    conteudo: { type: String, required: true },
    data: { type: Date, default: Date.now },
    autor: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  }],

  documentos: [{
    tipo: { type: String, required: true, enum: ['cv', 'carta_motivacao', 'outro'] },
    nome: String,
    data: Buffer,
    mimeType: String,
    uploadadoEm: { type: Date, default: Date.now },
    uploadadoPor: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  }]
}, { timestamps: true });

// Índices
contactSchema.index({ email: 1 });
contactSchema.index({ 'responsaveis.userId': 1, 'responsaveis.status': 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ pipeline_status: 1 });
contactSchema.index({ departamento: 1 });
contactSchema.index({ agencia: 1 });

// Middleware pre-save para métricas
contactSchema.pre('save', async function(next) {
  if (this.isNew) {
    if (!this.responsaveis.some(resp => resp.status === 'ativo')) {
      throw new Error('Candidato deve ter pelo menos um responsável ativo.');
    }
    if (!this.metricas) {
      this.metricas = { data_identificacao: new Date() };
    }
  }
  next();
});

// Métodos do modelo
contactSchema.methods = {
  async updatePipelineStatus(novoStatus, autorId, observacao) {
    const oldStatus = this.pipeline_status;
    this.pipeline_status = novoStatus;

    if (!this.metricas) this.metricas = {};
    this.metricas[`data_${novoStatus}`] = new Date();
    if (this.metricas[`data_${oldStatus}`]) {
      this.metricas[`tempo_${oldStatus}`] = new Date() - new Date(this.metricas[`data_${oldStatus}`]);
    }
    this.historico.push({ tipo: 'mudanca_status', conteudo: `Status alterado de ${oldStatus} para ${novoStatus}${observacao ? ': ' + observacao : ''}`, data: new Date(), autor: autorId });
    return this.save();
  }
};

const Contact = mongoose.model('Contact', contactSchema);
module.exports = { Contact };
