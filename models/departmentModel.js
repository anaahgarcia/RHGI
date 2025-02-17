// departmentModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const departmentSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    manager: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    agencias: [{
        type: Schema.Types.ObjectId,
        ref: 'Agency'
    }],
    status: {
        type: String,
        enum: ['ativo', 'inativo'],
        default: 'ativo'
    }
}, {
    timestamps: true
});

const Department = mongoose.model('Department', departmentSchema);

module.exports = { Department };