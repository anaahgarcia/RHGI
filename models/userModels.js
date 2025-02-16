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
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },

    // Role e Status
    role: {
        type: String,
        enum: ['Admin', 'Manager', 'Director', 'Broker', 'Employee'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },

    // Departamento e Hierarquia
    department: {
        type: String,
        required: function() {
            return this.role !== 'Admin' && this.role !== 'Manager';
        }
    },
    managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function() {
            return this.role === 'Employee' || this.role === 'Broker';
        }
    },
    brokerTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function() {
            return this.role === 'Employee' && this.department === 'Commercial';
        }
    },

    // Agências
    agencies: [{
        agencyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agency',
            required: true
        },
        assignedDate: {
            type: Date,
            default: Date.now
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    }],

    // Foto do perfil
    photo: {
        data: Buffer,
        contentType: String,
        uploadedAt: Date
    },

    // Campos de auditoria
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedAt: {
        type: Date
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    inactivatedAt: {
        type: Date
    },
    inactivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Histórico de alterações
    changeHistory: [{
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        changedAt: {
            type: Date,
            default: Date.now
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    }]
}, {
    timestamps: true
});

// Middleware para registrar alterações
userSchema.pre('save', async function(next) {
    if (this.isModified()) {
        const changedFields = this.modifiedPaths();
        changedFields.forEach(field => {
            if (field !== 'updatedAt' && field !== 'changeHistory') {
                this.changeHistory.push({
                    field,
                    oldValue: this._original ? this._original[field] : undefined,
                    newValue: this[field],
                    changedBy: this.updatedBy
                });
            }
        });
    }
    next();
});

// Método para verificar permissões entre usuários
userSchema.methods.canManage = function(targetUser) {
    // Admin pode gerenciar qualquer um
    if (this.role === 'Admin') return true;

    // Manager pode gerenciar todos exceto Admin
    if (this.role === 'Manager') {
        return targetUser.role !== 'Admin';
    }

    // Director pode gerenciar apenas sua equipe no mesmo departamento
    if (this.role === 'Director') {
        return targetUser.department === this.department && 
               ['Broker', 'Employee'].includes(targetUser.role);
    }

    // Broker pode gerenciar apenas sua equipe
    if (this.role === 'Broker') {
        return targetUser.brokerTeam && 
               targetUser.brokerTeam.toString() === this._id.toString() &&
               targetUser.role === 'Employee';
    }

    // Employee não pode gerenciar ninguém
    return false;
};

// Método para verificar acesso à agência
userSchema.methods.hasAgencyAccess = function(agencyId) {
    if (this.role === 'Admin' || this.role === 'Manager') return true;
    
    return this.agencies.some(agency => 
        agency.agencyId.toString() === agencyId.toString() && 
        agency.status === 'active'
    );
};

const User = mongoose.model('User', userSchema);

module.exports = { User };