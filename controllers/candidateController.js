const multer = require('multer');
const { Contact } = require('../models/candidateModel');
const { User } = require('../models/userModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

const CandidateController = {
  // Create new candidate or add user as responsible
  createCandidate: async (req, res) => {
    try {
      const { nome, email, telefone, nif } = req.body;

      // Check if candidate exists
      const existingCandidate = await Contact.findOne({
        $or: [
          { email: email.toLowerCase() },
          { nif }
        ]
      });

      if (existingCandidate) {
        // Add current user as responsible if not already
        if (!existingCandidate.responsaveis.some(resp => 
          resp.userId.toString() === req.user._id.toString()
        )) {
          existingCandidate.responsaveis.push({
            userId: req.user._id,
            data_atribuicao: new Date(),
            status: 'ativo'
          });

          existingCandidate.historico.push({
            tipo: 'sistema',
            conteudo: `Novo responsável adicionado: ${req.user.nome}`,
            data: new Date(),
            autor: req.user._id
          });

          await existingCandidate.save();
        }

        return res.json({
          message: 'Candidato existente associado ao usuário',
          candidate: existingCandidate
        });
      }

      // Create new candidate
      const candidate = new Contact({
        nome,
        email: email.toLowerCase(),
        telefone,
        nif,
        status: 'ativo',
        responsaveis: [{
          userId: req.user._id,
          data_atribuicao: new Date(),
          status: 'ativo'
        }],
        historico: [{
          tipo: 'sistema',
          conteudo: 'Candidato cadastrado no sistema',
          data: new Date(),
          autor: req.user._id
        }]
      });

      await candidate.save();

      // SQLite backup
      await db.run(
        'INSERT INTO candidatos (id, nome, email, telefone, nif, status, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [candidate._id.toString(), nome, email, telefone, nif, 'ativo', req.user._id.toString()]
      );

      res.status(201).json({ candidate });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get candidates list
  getCandidates: async (req, res) => {
    try {
      const candidates = await Contact.find({
        'responsaveis': {
          $elemMatch: {
            userId: req.user._id,
            status: 'ativo'
          }
        }
      }).populate('responsaveis.userId', 'nome email');

      res.json({ candidates });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get single candidate
  getCandidate: async (req, res) => {
    try {
      const candidate = await Contact.findOne({
        _id: req.params.id,
        'responsaveis': {
          $elemMatch: {
            userId: req.user._id,
            status: 'ativo'
          }
        }
      }).populate('responsaveis.userId historico.autor', 'nome email');

      if (!candidate) {
        return res.status(404).json({ error: 'Candidato não encontrado' });
      }

      res.json({ candidate });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Update candidate
  updateCandidate: async (req, res) => {
    try {
      const candidate = await Contact.findOne({
        _id: req.params.id,
        'responsaveis': {
          $elemMatch: {
            userId: req.user._id,
            status: 'ativo'
          }
        }
      });

      if (!candidate) {
        return res.status(404).json({ error: 'Candidato não encontrado' });
      }

      const updates = req.body;
      Object.keys(updates).forEach(key => {
        candidate[key] = updates[key];
      });

      candidate.historico.push({
        tipo: 'atualizacao',
        conteudo: 'Informações atualizadas',
        data: new Date(),
        autor: req.user._id
      });

      await candidate.save();

      // SQLite backup
      await db.run(
        'UPDATE candidatos SET nome = ?, email = ?, telefone = ?, atualizado_em = ? WHERE id = ?',
        [candidate.nome, candidate.email, candidate.telefone, new Date().toISOString(), candidate._id.toString()]
      );

      res.json({ candidate });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Add interaction
  addInteraction: async (req, res) => {
    try {
      const { tipo, conteudo } = req.body;
      const candidate = await Contact.findOne({
        _id: req.params.id,
        'responsaveis': {
          $elemMatch: {
            userId: req.user._id,
            status: 'ativo'
          }
        }
      });

      if (!candidate) {
        return res.status(404).json({ error: 'Candidato não encontrado' });
      }

      candidate.historico.push({
        tipo,
        conteudo,
        data: new Date(),
        autor: req.user._id
      });

      await candidate.save();

      // SQLite backup
      await db.run(
        'INSERT INTO interacoes (candidato_id, tipo, conteudo, autor_id, data) VALUES (?, ?, ?, ?, ?)',
        [candidate._id.toString(), tipo, conteudo, req.user._id.toString(), new Date().toISOString()]
      );

      res.json({ message: 'Interação registrada' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Inactivate candidate
  inactivateCandidate: async (req, res) => {
    try {
      const { motivo } = req.body;
      const candidate = await Contact.findOne({
        _id: req.params.id,
        'responsaveis': {
          $elemMatch: {
            userId: req.user._id,
            status: 'ativo'
          }
        }
      });

      if (!candidate) {
        return res.status(404).json({ error: 'Candidato não encontrado' });
      }

      candidate.status = 'inativo';
      candidate.historico.push({
        tipo: 'inativacao',
        conteudo: `Inativado: ${motivo}`,
        data: new Date(),
        autor: req.user._id
      });

      await candidate.save();

      // SQLite backup
      await db.run(
        'UPDATE candidatos SET status = ?, inativado_em = ?, inativado_por = ? WHERE id = ?',
        ['inativo', new Date().toISOString(), req.user._id.toString(), candidate._id.toString()]
      );

      res.json({ message: 'Candidato inativado' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = CandidateController;