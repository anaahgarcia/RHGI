const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    // Informações básicas
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    nome: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    telefone: {
        type: String,
        trim: true
    },

    // Role e Status
// Alterar a parte de Role e Status
role: {
    type: String,
    enum: [
        'Admin',
        'Manager',
        'Diretor de RH',
        'Diretor Comercial',
        'Diretor de Marketing',
        'Diretor de Crédito',
        'Diretor de Remodelações',
        'Diretor Financeiro',
        'Diretor Jurídico',
        'Broker de Equipa',
        'Recrutador',
        'Consultor',
        'Employee'
    ],
    required: true
},

// Alterar a validação do departamento
departamento: {
    type: String,
    required: function() {
        // Admin e Manager não precisam de departamento
        return !['Admin', 'Manager'].includes(this.role);
    },
    enum: ['RH', 'Comercial', 'Marketing', 'Crédito', 'Remodelações', 'Financeiro', 'Jurídico'],
    // Adicionar validate para permitir null quando for Admin ou Manager
    validate: {
        validator: function(v) {
            if (['Admin', 'Manager'].includes(this.role)) {
                return true; // Permite null/undefined para Admin e Manager
            }
            return this.departamento != null;
        },
        message: 'Departamento é obrigatório exceto para Admin e Manager'
    }
},

// Alterar as validações dos campos de hierarquia
responsavelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
        return !['Admin', 'Manager'].includes(this.role);
    }
},

brokerEquipaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
        return this.role === 'Consultor';
    }
},
    status: {
        type: String,
        enum: ['ativo', 'inativo'],
        default: 'ativo'
    },

    // Departamento e Hierarquia
    departamento: {
        type: String,
        required: function() {
            return !['Admin', 'Manager'].includes(this.role);
        },
        enum: ['RH', 'Comercial', 'Marketing', 'Crédito', 'Remodelações', 'Financeiro', 'Jurídico']
    },

    responsavelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    brokerEquipaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Agências
    agencias: [{
        agenciaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agency'
        },
        status: {
            type: String,
            enum: ['ativo', 'inativo'],
            default: 'ativo'
        },
        dataAssociacao: {
            type: Date,
            default: Date.now
        },
        associadoPor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        dataInativacao: Date,
        inativadoPor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],

    // Foto do perfil
    photo: {
        data: Buffer,
        contentType: String,
        uploadedAt: Date
    },

    // Campos de auditoria
    criadoEm: {
        type: Date,
        default: Date.now
    },
    criadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    atualizadoEm: {
        type: Date
    },
    atualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    inativadoEm: {
        type: Date
    },
    inativadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    motivoInativacao: String,

    // Histórico de alterações
    historico: [{
        tipo: {
            type: String,
            enum: ['sistema', 'atualizacao', 'inativacao'],
            required: true
        },
        campo: String,
        valorAntigo: mongoose.Schema.Types.Mixed,
        valorNovo: mongoose.Schema.Types.Mixed,
        data: {
            type: Date,
            default: Date.now
        },
        autor: {
            type: mongoose.Schema.Types.ObjectId,
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

// Middleware para registrar alterações
userSchema.pre('save', async function(next) {
    if (this.isModified()) {
        const changedFields = this.modifiedPaths();
        changedFields.forEach(field => {
            if (!['criadoEm', 'atualizadoEm', 'historico'].includes(field)) {
                this.historico.push({
                    tipo: 'atualizacao',
                    campo: field,
                    valorAntigo: this._original ? this._original[field] : undefined,
                    valorNovo: this[field],
                    data: new Date(),
                    autor: this.atualizadoPor
                });
            }
        });
    }
    next();
});

// Método para verificar permissões
userSchema.methods.verificarPermissoes = function(targetUser) {
    if (this.role === 'Admin' || this.role === 'Manager') {
        return true;
    }

    if (this.role.startsWith('Diretor')) {
        return targetUser.departamento === this.departamento;
    }

    if (this.role === 'Broker de Equipa') {
        return targetUser.brokerEquipaId && 
               targetUser.brokerEquipaId.toString() === this._id.toString();
    }

    return this._id.toString() === targetUser._id.toString();
};

// Método para verificar acesso à agência
userSchema.methods.verificarAcessoAgencia = function(agenciaId) {
    if (this.role === 'Admin' || this.role === 'Manager') {
        return true;
    }
    
    return this.agencias.some(agencia => 
        agencia.agenciaId.toString() === agenciaId.toString() && 
        agencia.status === 'ativo'
    );
};

const User = mongoose.model('User', userSchema);

module.exports = { User };