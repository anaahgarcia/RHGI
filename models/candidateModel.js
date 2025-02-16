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

  nif: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: async function(v) {
        if (!/^\d{9}$/.test(v)) return false;
        if (this.isNew) {
          const existingCandidate = await mongoose.models.Contact.findOne({ nif: v });
          return !existingCandidate;
        }
        return true;
      },
      message: 'NIF inválido ou já cadastrado.'
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
      values: ['Site da imobiliária', 'LinkedIn', 'Indicação', 
        'Redes Sociais', 'Site de emprego', 'Olx', 'SapoEmprego', 'Placas', 'Cartões','Telefonou na agência',
         'Outro'],
      message: 'Origem de contato inválida.'
    }
  },

  departamento: {
    type: String,
    required: true,
    enum: {
      values: ['Crédito', 'Comercial', 'Marketing', 'RH', 'Remodelações', 'Financeiro', 'Jurídico', 'Outro'],
      message: 'Deparamento inválido.'
    }
    
  },

  agencia: {
    type: Schema.Types.ObjectId,
    ref: 'Agency',
    required: true,
    validate: {
      validator: async function(v) {
        try {
          const agency = await mongoose.model('Agency').findById(v);
          return agency !== null;
        } catch (err) {
          return false;
        }
      },
      message: 'Agência inválida ou inexistente.'
    }
  },

  skills: [{
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return v.length >= 2;
      },
      message: 'Skill deve ter pelo menos 2 caracteres.'
    }
  }],

  anos_experiencia: {
    type: Number,
    min: [0, 'Anos de experiência não pode ser negativo'],
    max: [50, 'Anos de experiência não pode exceder 50']
  },

  especializacao: [{
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return v.length >= 2;
      },
      message: 'Especialização deve ter pelo menos 2 caracteres.'
    }
  }],

  cidade: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || v.length >= 2;
      },
      message: 'Cidade deve ter pelo menos 2 caracteres.'
    }
  },

  distrito: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || v.length >= 2;
      },
      message: 'Distrito deve ter pelo menos 2 caracteres.'
    }
  },

  status: {
    type: String,
    required: true,
    enum: {
      values: ['ativo', 'inativo'],
      message: 'Status inválido.'
    },
    default: 'ativo'
  },

  responsaveis: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator: async function(v) {
          try {
            const user = await mongoose.model('User').findById(v);
            return user !== null;
          } catch (err) {
            return false;
          }
        },
        message: 'Usuário responsável inválido ou inexistente.'
      }
    },
    data_atribuicao: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: {
        values: ['ativo', 'inativo'],
        message: 'Status do responsável inválido.'
      },
      default: 'ativo'
    }
  }],

  historico: [{
    tipo: {
      type: String,
      required: true,
      enum: {
        values: ['sistema', 'atualizacao', 'interacao', 'inativacao'],
        message: 'Tipo de histórico inválido.'
      }
    },
    conteudo: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return v.length >= 3;
        },
        message: 'Conteúdo do histórico deve ter pelo menos 3 caracteres.'
      }
    },
    data: {
      type: Date,
      default: Date.now
    },
    autor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator: async function(v) {
          try {
            const user = await mongoose.model('User').findById(v);
            return user !== null;
          } catch (err) {
            return false;
          }
        },
        message: 'Autor do histórico inválido ou inexistente.'
      }
    }
  }],

  documentos: [{
    tipo: {
      type: String,
      required: true,
      enum: {
        values: ['cv', 'carta_motivacao', 'outro'],
        message: 'Tipo de documento inválido.'
      }
    },
    nome: {
      type: String,
      required: true
    },
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
  timestamps: {
    createdAt: 'criadoEm',
    updatedAt: 'atualizadoEm'
  }
});

// Índices
contactSchema.index({ email: 1 });
contactSchema.index({ nif: 1 }, { unique: true });
contactSchema.index({ 'responsaveis.userId': 1, 'responsaveis.status': 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ departamento: 1 });
contactSchema.index({ agencia: 1 });

// Middleware pre-save para validação adicional
contactSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Verifica se pelo menos um responsável ativo
    const hasActiveResponsible = this.responsaveis.some(resp => resp.status === 'ativo');
    if (!hasActiveResponsible) {
      throw new Error('Candidato deve ter pelo menos um responsável ativo.');
    }
  }
  next();
});

// Método para verificar se um usuário é responsável ativo
contactSchema.methods.isActiveResponsible = function(userId) {
  return this.responsaveis.some(resp => 
    resp.userId.toString() === userId.toString() && resp.status === 'ativo'
  );
};

// Método para adicionar interação ao histórico
contactSchema.methods.addInteraction = async function(tipo, conteudo, autorId) {
  this.historico.push({
    tipo,
    conteudo,
    data: new Date(),
    autor: autorId
  });
  return this.save();
};

const Contact = mongoose.model('Contact', contactSchema);

module.exports = { Contact };