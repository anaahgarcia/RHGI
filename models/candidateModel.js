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
    enum: {
      values: ['Recrutamento'],
      message: 'Tipo de contato inválido.'
    }
  },

  importancia: {
    type: String,
    required: true,
    enum: {
      values: ['Baixa', 'Média', 'Alta', 'Urgente'],
      message: 'Nível de importância inválido.'
    }
  },

  origem_contato: {
    type: String,
    required: true,
    enum: {
      values: ['Site da imobiliária', 'LinkedIn', 'Indicação', 'Redes Sociais', 'Site de emprego', 
               'Olx', 'SapoEmprego', 'Placas', 'Cartões', 'Telefonou na agência', 'Outro'],
      message: 'Origem de contato inválida.'
    }
  },

  // Campos de Pipeline e Status
  status: {
    type: String,
    required: true,
    enum: {
      values: ['ativo', 'inativo'],
      message: 'Status inválido.'
    },
    default: 'ativo'
  },

  pipeline_status: {
    type: String,
    required: true,
    enum: {
      values: ['identificacao', 'lead', 'chamada', 'agendamento', 'entrevista', 'recrutado', 'inativo'],
      message: 'Status do pipeline inválido.'
    },
    default: 'identificacao'
  },

  // Campos de Indicação
  indicacao: {
    type: Boolean,
    default: false
  },

  nivel_indicacao: {
    type: String,
    enum: {
      values: ['baixa', 'media', 'alta'],
      message: 'Nível de indicação inválido.'
    },
    required: function() {
      return this.indicacao === true;
    }
  },

  responsavel_indicacao: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.indicacao === true;
    },
    validate: {
      validator: async function(v) {
        if (!this.indicacao) return true;
        try {
          const user = await mongoose.model('User').findById(v);
          return user !== null;
        } catch (err) {
          return false;
        }
      },
      message: 'Responsável pela indicação inválido ou inexistente.'
    }
  },

  // Campos de Localização e Experiência
  departamento: {
    type: String,
    required: true,
    enum: {
      values: ['Crédito', 'Comercial', 'Marketing', 'RH', 'Remodelações', 'Financeiro', 'Jurídico', 'Outro'],
      message: 'Departamento inválido.'
    }
  },

  agencia: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true
  },

  cidade: {
    type: String,
    trim: true
  },

  distrito: {
    type: String,
    trim: true
  },

  skills: [{
    type: String,
    trim: true
  }],

  experiencia: {
    type: Number,
    min: 0,
    max: 50
  },

  // Campos de Métricas e Análise
  metricas: {
    data_identificacao: Date,
    data_lead: Date,
    data_recrutamento: Date,
    tempo_identificacao: Number,
    tempo_lead: Number,
    tempo_chamada: Number,
    tempo_agendamento: Number,
    tempo_entrevista: Number,
    chamadas: [{
      numero: Number,
      data: Date,
      status: String,
      observacoes: String
    }],
    agendamentos: [{
      numero: Number,
      data: Date,
      tipo: String,
      status: String,
      observacoes: String
    }],
    entrevistas: [{
      numero: Number,
      data: Date,
      tipo: String,
      status: String,
      observacoes: String
    }]
  },

  cv_analisado: {
    type: Boolean,
    default: false
  },

  // Responsáveis e Histórico
  responsaveis: [{
    userId: {
      type: Schema.Types.ObjectId,
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

  historico: [{
    tipo: {
      type: String,
      required: true,
      enum: ['sistema', 'atualizacao', 'interacao', 'inativacao', 'mudanca_status'],
      message: 'Tipo de histórico inválido.'
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
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],

  // Documentos
  documentos: [{
    tipo: {
      type: String,
      required: true,
      enum: ['cv', 'carta_motivacao', 'outro']
    },
    nome: String,
    data: Buffer,
    mimeType: String,
    uploadadoEm: {
      type: Date,
      default: Date.now
    },
    uploadadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }]
}, {
  timestamps: true
});

// Índices
contactSchema.index({ email: 1 });
contactSchema.index({ 'responsaveis.userId': 1, 'responsaveis.status': 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ pipeline_status: 1 });
contactSchema.index({ departamento: 1 });
contactSchema.index({ agencia: 1 });

// Middleware pre-save
contactSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Verifica se tem pelo menos um responsável ativo
    const hasActiveResponsible = this.responsaveis.some(resp => resp.status === 'ativo');
    if (!hasActiveResponsible) {
      throw new Error('Candidato deve ter pelo menos um responsável ativo.');
    }

    // Inicializa métricas
    if (!this.metricas) {
      this.metricas = {
        data_identificacao: new Date()
      };
    }
  }
  next();
});

// Métodos do modelo
contactSchema.methods = {
  isActiveResponsible(userId) {
    return this.responsaveis.some(resp => 
      resp.userId.toString() === userId.toString() && resp.status === 'ativo'
    );
  },

  async addInteraction(tipo, conteudo, autorId) {
    this.historico.push({
      tipo,
      conteudo,
      data: new Date(),
      autor: autorId
    });
    return this.save();
  },

  async updatePipelineStatus(novoStatus, autorId, observacao) {
    const oldStatus = this.pipeline_status;
    this.pipeline_status = novoStatus;

    // Atualiza métricas
    if (!this.metricas) this.metricas = {};
    this.metricas[`data_${novoStatus}`] = new Date();

    if (this.metricas[`data_${oldStatus}`]) {
      const tempoNoStatus = new Date() - new Date(this.metricas[`data_${oldStatus}`]);
      this.metricas[`tempo_${oldStatus}`] = tempoNoStatus;
    }

    // Adiciona ao histórico
    this.historico.push({
      tipo: 'mudanca_status',
      conteudo: `Status alterado de ${oldStatus} para ${novoStatus}${observacao ? ': ' + observacao : ''}`,
      data: new Date(),
      autor: autorId
    });

    return this.save();
  }
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = { Contact };