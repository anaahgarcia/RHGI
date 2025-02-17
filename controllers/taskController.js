const { Task } = require('../models/taskModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

// Função auxiliar para verificar se o usuário está envolvido na tarefa
function usuarioTemPermissaoParaTarefa(usuario, tarefa) {
  // Admin e Manager podem ver tudo
  if (usuario.role === 'Admin' || usuario.role === 'Manager') {
    return true;
  }

  // Se o usuário for Diretor ou Broker, poderá ver tarefas do mesmo departamento
  if (usuario.role.startsWith('Diretor') || usuario.role === 'Broker') {
    // Aqui supomos que a tarefa possui um campo "departamento" que indica a equipe ou o departamento do destinatário
    if (tarefa.departamento === usuario.departamento) {
      return true;
    }
  }

  // Usuários como Recrutador, Employee e Consultor podem ver a tarefa se forem:
  // - Criador da tarefa
  // - Destinatário da tarefa
  // - Estiverem entre os responsáveis
  // - Estiverem entre os acompanhantes
  if (
    tarefa.criador.toString() === usuario._id.toString() ||
    (tarefa.destinatario && tarefa.destinatario.toString() === usuario._id.toString()) ||
    (tarefa.responsaveis && tarefa.responsaveis.some(r => r.toString() === usuario._id.toString())) ||
    (tarefa.acompanhantes && tarefa.acompanhantes.some(a => a.toString() === usuario._id.toString()))
  ) {
    return true;
  }

  return false;
}

const taskController = {
  // Criar nova tarefa
  criarTarefa: async (req, res) => {
    console.log("POST: /api/tarefas -", JSON.stringify(req.body));
    try {
      const {
        titulo,
        descricao,
        data,          // Data de criação ou agendamento
        prazo,         // Data limite para conclusão
        status,        // Ex.: "Pendente", "Em andamento", "Concluída"
        destinatario,  // ID do usuário para quem a tarefa foi designada
        responsaveis,  // Array de IDs de usuários responsáveis pela execução
        acompanhantes, // Array de IDs de usuários que acompanharão a tarefa
        departamento   // Departamento relacionado à tarefa (opcional)
      } = req.body;

      if (!titulo || !descricao) {
        return res.status(400).json({ error: "Os campos 'título' e 'descrição' são obrigatórios." });
      }

      // Cria a tarefa no MongoDB
      const novaTarefa = new Task({
        titulo,
        descricao,
        data: data ? new Date(data) : new Date(),
        prazo: prazo ? new Date(prazo) : null,
        status: status || "Pendente",
        criador: req.user._id,
        destinatario,
        responsaveis: responsaveis || [],
        acompanhantes: acompanhantes || [],
        departamento: departamento || req.user.departamento // Se não informado, assume o departamento do criador
      });

      const tarefaSalva = await novaTarefa.save();

      // Registra a tarefa no SQLite
      const querySQLite = `
        INSERT INTO tarefas (
          id,
          titulo,
          descricao,
          data,
          prazo,
          status,
          criador,
          destinatario,
          responsaveis,
          acompanhantes,
          departamento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      // Convertendo arrays para string JSON para armazenar no SQLite
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [
          tarefaSalva._id.toString(),
          titulo,
          descricao,
          tarefaSalva.data.toISOString(),
          tarefaSalva.prazo ? tarefaSalva.prazo.toISOString() : null,
          tarefaSalva.status,
          req.user._id.toString(),
          destinatario || null,
          JSON.stringify(responsaveis || []),
          JSON.stringify(acompanhantes || []),
          tarefaSalva.departamento || null
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(201).json(tarefaSalva);
    } catch (error) {
      console.error("Erro ao criar tarefa:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obter todas as tarefas (filtradas conforme a permissão do usuário)
  obterTarefas: async (req, res) => {
    console.log("GET: /api/tarefas");
    try {
      let tarefas = await Task.find()
        .populate('criador', 'nome email')
        .populate('destinatario', 'nome email')
        .populate('responsaveis', 'nome email')
        .populate('acompanhantes', 'nome email')
        .sort({ data: -1 });

      // Filtra as tarefas conforme a permissão do usuário
      tarefas = tarefas.filter(tarefa => usuarioTemPermissaoParaTarefa(req.user, tarefa));
      return res.json(tarefas);
    } catch (error) {
      console.error("Erro ao obter tarefas:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obter uma tarefa específica
  obterTarefa: async (req, res) => {
    console.log(`GET: /api/tarefas/${req.params.id}`);
    try {
      const tarefa = await Task.findById(req.params.id)
        .populate('criador', 'nome email')
        .populate('destinatario', 'nome email')
        .populate('responsaveis', 'nome email')
        .populate('acompanhantes', 'nome email');

      if (!tarefa) {
        return res.status(404).json({ error: "Tarefa não encontrada." });
      }

      if (!usuarioTemPermissaoParaTarefa(req.user, tarefa)) {
        return res.status(403).json({ error: "Sem permissão para visualizar esta tarefa." });
      }

      return res.json(tarefa);
    } catch (error) {
      console.error("Erro ao obter tarefa:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Atualizar uma tarefa
  atualizarTarefa: async (req, res) => {
    console.log(`PUT: /api/tarefas/${req.params.id} -`, JSON.stringify(req.body));
    try {
      const tarefa = await Task.findById(req.params.id);
      if (!tarefa) {
        return res.status(404).json({ error: "Tarefa não encontrada." });
      }

      // Verifica se o usuário tem permissão para atualizar a tarefa
      if (!usuarioTemPermissaoParaTarefa(req.user, tarefa)) {
        return res.status(403).json({ error: "Sem permissão para atualizar esta tarefa." });
      }

      // Atualiza os campos permitidos
      Object.keys(req.body).forEach(campo => {
        tarefa[campo] = req.body[campo];
      });
      // Exemplo: atualiza a data de última modificação
      tarefa.atualizadoEm = new Date();

      const tarefaAtualizada = await tarefa.save();

      // Atualiza o registro no SQLite
      const queryUpdate = `
        UPDATE tarefas
        SET titulo = ?,
            descricao = ?,
            data = ?,
            prazo = ?,
            status = ?,
            destinatario = ?,
            responsaveis = ?,
            acompanhantes = ?,
            departamento = ?,
            atualizado_em = ?
        WHERE id = ?
      `;
      await new Promise((resolve, reject) => {
        db.run(queryUpdate, [
          tarefaAtualizada.titulo,
          tarefaAtualizada.descricao,
          tarefaAtualizada.data.toISOString(),
          tarefaAtualizada.prazo ? tarefaAtualizada.prazo.toISOString() : null,
          tarefaAtualizada.status,
          tarefaAtualizada.destinatario ? tarefaAtualizada.destinatario.toString() : null,
          JSON.stringify(tarefaAtualizada.responsaveis || []),
          JSON.stringify(tarefaAtualizada.acompanhantes || []),
          tarefaAtualizada.departamento || null,
          tarefaAtualizada.atualizadoEm.toISOString(),
          req.params.id
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json(tarefaAtualizada);
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Deletar (ou inativar) uma tarefa
  deletarTarefa: async (req, res) => {
    console.log(`DELETE: /api/tarefas/${req.params.id}`);
    try {
      const tarefa = await Task.findById(req.params.id);
      if (!tarefa) {
        return res.status(404).json({ error: "Tarefa não encontrada." });
      }

      if (!usuarioTemPermissaoParaTarefa(req.user, tarefa)) {
        return res.status(403).json({ error: "Sem permissão para excluir esta tarefa." });
      }

      // Aqui, podemos optar por excluir ou apenas marcar como inativa.
      // Neste exemplo, vamos excluir a tarefa do MongoDB.
      await Task.findByIdAndDelete(req.params.id);

      // No SQLite, atualizamos o registro marcando o status como 'deleted'
      const queryDelete = `
        UPDATE tarefas
        SET status = 'deleted',
            atualizado_em = ?
        WHERE id = ?
      `;
      await new Promise((resolve, reject) => {
        db.run(queryDelete, [
          new Date().toISOString(),
          req.params.id
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ message: "Tarefa excluída (ou inativada) com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir tarefa:", error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = taskController;
