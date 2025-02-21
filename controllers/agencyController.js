const { Agency } = require('../models/agencyModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

const agencyController = {
  // Criar nova agência – permitido somente para Admin e Manager
  criarAgencia: async (req, res) => {
    console.log("POST: /api/agencias -", JSON.stringify(req.body));
    try {
      if (!(req.user.role === 'Admin' || req.user.role === 'Manager')) {
        return res.status(403).json({ error: 'Sem permissão para criar agências.' });
      }

      const { nome, manager, diretores, departamentos, employees } = req.body;
      
      if (!nome || !manager) {
        return res.status(400).json({ error: 'Os campos "nome" e "manager" são obrigatórios.' });
      }

      // Criar uma nova agência apenas com nome e manager
      const novaAgencia = new Agency({
        nome,
        manager,
        diretores: diretores || [],        // Pode ser adicionado depois
        departamentos: departamentos || [], // Pode ser adicionado depois
        employees: employees || []         // Pode ser adicionado depois
      });

      const agenciaSalva = await novaAgencia.save();

      const querySQLite = `
      INSERT INTO agencias (
        id,
        nome,
        manager,
        diretores,
        departamentos,
        employees,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await new Promise((resolve, reject) => {
      db.run(querySQLite, [
        agenciaSalva._id.toString(),
        nome,
        manager,
        JSON.stringify(diretores || []),
        JSON.stringify(departamentos || []),
        JSON.stringify(employees || []),
        'ativo'
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

      return res.status(201).json(agenciaSalva);
    } catch (error) {
      console.error("Erro ao criar agência:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Listar todas as agências – todos os usuários podem visualizar
  listarAgencias: async (req, res) => {
    console.log("GET: /api/agencias");
    try {
      const agencias = await Agency.find()
        .populate('manager', 'nome email telefone')
        .populate('diretores', 'nome email telefone')
        .populate('departamentos', 'nome')
        .populate('employees', 'nome email telefone')
        .sort({ nome: 1 });
      return res.json(agencias);
    } catch (error) {
      console.error("Erro ao listar agências:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obter detalhes de uma agência específica – todos os usuários podem visualizar
  obterAgencia: async (req, res) => {
    console.log(`GET: /api/agencias/${req.params.id}`);
    try {
      const agencia = await Agency.findById(req.params.id)
        .populate('manager', 'nome email telefone')
        .populate('diretores', 'nome email telefone')
        .populate('departamentos', 'nome')
        .populate('employees', 'nome email telefone');
      if (!agencia) {
        return res.status(404).json({ error: 'Agência não encontrada.' });
      }
      return res.json(agencia);
    } catch (error) {
      console.error("Erro ao obter agência:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Atualizar uma agência – permitido somente para Admin e Manager
  atualizarAgencia: async (req, res) => {
    console.log(`PUT: /api/agencias/${req.params.id} -`, JSON.stringify(req.body));
    try {
      if (!(req.user.role === 'Admin' || req.user.role === 'Manager')) {
        return res.status(403).json({ error: 'Sem permissão para atualizar agências.' });
      }

      const agencia = await Agency.findById(req.params.id);
      if (!agencia) {
        return res.status(404).json({ error: 'Agência não encontrada.' });
      }

      const { nome, manager, diretores, departamentos, employees } = req.body;

      if (nome) agencia.nome = nome;
      if (manager) agencia.manager = manager;
      if (diretores) agencia.diretores = diretores;
      if (departamentos) agencia.departamentos = departamentos;
      if (employees) agencia.employees = employees;

      const agenciaAtualizada = await agencia.save();

      // Atualizar SQLite
      const querySQLite = `
        UPDATE agencias
        SET nome = ?,
            manager = ?,
            diretores = ?,
            departamentos = ?,
            employees = ?
        WHERE id = ?
      `;
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [
          agenciaAtualizada.nome,
          agenciaAtualizada.manager.toString(),
          JSON.stringify(agenciaAtualizada.diretores || []),
          JSON.stringify(agenciaAtualizada.departamentos || []),
          JSON.stringify(agenciaAtualizada.employees || []),
          req.params.id
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json(agenciaAtualizada);
    } catch (error) {
      console.error("Erro ao atualizar agência:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Excluir (inativar) uma agência – permitido somente para Admin e Manager
  deletarAgencia: async (req, res) => {
    console.log(`DELETE: /api/agencias/${req.params.id}`);
    try {
      if (!(req.user.role === 'Admin' || req.user.role === 'Manager')) {
        return res.status(403).json({ error: 'Sem permissão para excluir agências.' });
      }
      const agencia = await Agency.findByIdAndUpdate(
        req.params.id, 
        { status: 'inativo' },
        { new: true }
      );
      
      if (!agencia) {
        return res.status(404).json({ error: 'Agência não encontrada.' });
      }

      const querySQLite = `
        UPDATE agencias
        SET status = 'inativo'
        WHERE id = ?
      `;
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [req.params.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ message: 'Agência excluída (inativada) com sucesso.' });
    } catch (error) {
      console.error("Erro ao excluir agência:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Reativar uma agência – permitido somente para Admin e Manager
  reativarAgencia: async (req, res) => {
  console.log(`PUT: /api/agencies/${req.params.id}/reactivate`);
  try {
    if (!(req.user.role === 'Admin' || req.user.role === 'Manager')) {
      return res.status(403).json({ error: 'Sem permissão para reativar agências.' });
    }
    
    const agencia = await Agency.findByIdAndUpdate(
      req.params.id, 
      { status: 'ativo' },
      { new: true }
    );
    
    if (!agencia) {
      return res.status(404).json({ error: 'Agência não encontrada.' });
    }

    const querySQLite = `
      UPDATE agencias
      SET status = 'ativo'
      WHERE id = ?
    `;
    await new Promise((resolve, reject) => {
      db.run(querySQLite, [req.params.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.json({ 
      message: 'Agência reativada com sucesso.',
      agencia
    });
  } catch (error) {
    console.error("Erro ao reativar agência:", error);
    res.status(500).json({ error: error.message });
  }
}


};

module.exports = agencyController;
