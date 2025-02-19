const { CV } = require('../models/cvAnalysisModel');
const { User } = require('../models/userModel'); // Caso precise verificar departamento, etc.
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

// Função auxiliar para montar a query de acordo com a role do usuário
function montarFiltroCV(usuario) {
  // Se for Manager ou Admin, pode ver todos os CVs
  if (usuario.role === 'Manager' || usuario.role === 'Admin') {
    return {};
  }

  // Se for Diretor, filtra pelo departamento do usuário
  if (usuario.role.startsWith('Diretor')) {
    return { departamentoDono: usuario.departamento };
  }

  // Se for Recrutador, Employee ou Consultor, só vê o que ele mesmo criou
  if (['Recrutador', 'Employee', 'Consultor'].includes(usuario.role)) {
    return { dono: usuario._id };
  }

  // Caso não se encaixe em nada acima, filtra pelo dono
  return { dono: usuario._id };
}

const cvAnalysisController = {
  // Criar nova análise de CV
  criarAnalise: async (req, res) => {
    console.log("POST: /api/analise-cv -", JSON.stringify(req.body));
    try {
      const {
        idCandidato,     // ID do candidato (se houver)
        analise,         // Texto da análise
        pontuacao,       // Pontuação do CV
        classificacao,   // Ex.: "Interessante", "Em análise", etc.
        status           // Status do CV (Ex.: "Não contactado", "Em análise", etc.)
      } = req.body;

      if (!analise) {
        return res.status(400).json({ error: "O campo 'analise' é obrigatório." });
      }

      // Cria o documento no MongoDB
      const novaAnaliseCV = new CV({
        candidato: idCandidato || null,
        analise,
        pontuacao,
        classificacao,
        status: status || 'Em análise',
        analisadoPor: req.user._id,       // Quem fez a análise
        dataAnalise: new Date(),          // Data da análise
        dono: req.user._id,              // Quem criou este registro
        departamentoDono: req.user.departamento // Departamento de quem criou
      });

      const analiseSalva = await novaAnaliseCV.save();

      // Registra a análise no SQLite
      const insertSQLite = `
        INSERT INTO cv_analyses (
          id,
          candidato_id,
          analise,
          pontuacao,
          classificacao,
          status,
          analisado_por,
          data_analise,
          dono,
          departamento_dono
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await new Promise((resolve, reject) => {
        db.run(insertSQLite, [
          analiseSalva._id.toString(),
          idCandidato || null,
          analise,
          pontuacao || null,
          classificacao || null,
          analiseSalva.status,
          req.user._id.toString(),
          analiseSalva.dataAnalise.toISOString(),
          req.user._id.toString(),
          req.user.departamento || null
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(201).json(analiseSalva);
    } catch (error) {
      console.error("Erro ao criar análise de CV:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Retorna uma análise de CV específica
  obterAnalise: async (req, res) => {
    console.log(`GET: /api/analise-cv/${req.params.id}`);
    try {
      const idAnalise = req.params.id;

      // Busca o CV no MongoDB
      const analise = await CV.findById(idAnalise)
        .populate('candidato', 'nome email')
        .populate('analisadoPor', 'nome email');

      if (!analise) {
        return res.status(404).json({ error: "Análise de CV não encontrada." });
      }

      // Verifica permissões
      if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
        if (req.user.role.startsWith('Diretor')) {
          if (analise.departamentoDono !== req.user.departamento) {
            return res.status(403).json({ error: "Sem permissão para visualizar esta análise." });
          }
        } else {
          // Recrutador, Employee, Consultor
          if (analise.dono.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Sem permissão para visualizar esta análise." });
          }
        }
      }

      return res.json(analise);
    } catch (error) {
      console.error("Erro ao buscar análise de CV:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Retorna todas as análises de CV (filtradas conforme a role do usuário)
  obterTodasAnalises: async (req, res) => {
    console.log("GET: /api/analise-cv");
    try {
      // Monta a query de acordo com a role do usuário
      const filtro = montarFiltroCV(req.user);

      const analises = await CV.find(filtro)
        .populate('candidato', 'nome email')
        .populate('analisadoPor', 'nome email')
        .sort({ dataAnalise: -1 });

      return res.json(analises);
    } catch (error) {
      console.error("Erro ao buscar todas as análises de CV:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Atualiza uma análise de CV (mudança de status, pontuação, etc.)
  atualizarAnalise: async (req, res) => {
    console.log(`PUT: /api/analise-cv/${req.params.id} -`, JSON.stringify(req.body));
    try {
      const idAnalise = req.params.id;
      const atualizacoes = req.body;

      // Localiza a análise no MongoDB
      const analise = await CV.findById(idAnalise);
      if (!analise) {
        return res.status(404).json({ error: "Análise de CV não encontrada." });
      }

      // Verifica permissões
      if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
        if (req.user.role.startsWith('Diretor')) {
          if (analise.departamentoDono !== req.user.departamento) {
            return res.status(403).json({ error: "Sem permissão para atualizar esta análise." });
          }
        } else {
          if (analise.dono.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Sem permissão para atualizar esta análise." });
          }
        }
      }

      // Atualiza os campos
      Object.keys(atualizacoes).forEach((campo) => {
        analise[campo] = atualizacoes[campo];
      });
      // Exemplo: data de última atualização
      analise.atualizadoEm = new Date();

      const analiseAtualizada = await analise.save();

      // Atualiza no SQLite
      const updateSQLite = `
        UPDATE cv_analyses
        SET
          analise = ?,
          pontuacao = ?,
          classificacao = ?,
          status = ?,
          atualizado_em = ?
        WHERE id = ?
      `;

      await new Promise((resolve, reject) => {
        db.run(updateSQLite, [
          analiseAtualizada.analise,
          analiseAtualizada.pontuacao || null,
          analiseAtualizada.classificacao || null,
          analiseAtualizada.status || null,
          analiseAtualizada.atualizadoEm.toISOString(),
          idAnalise
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json(analiseAtualizada);
    } catch (error) {
      console.error("Erro ao atualizar análise de CV:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // "Deleta" (ou inativa) uma análise de CV
  deletarAnalise: async (req, res) => {
    console.log(`DELETE: /api/analise-cv/${req.params.id}`);
    try {
      const idAnalise = req.params.id;
      const analise = await CV.findById(idAnalise);
      if (!analise) {
        return res.status(404).json({ error: "Análise de CV não encontrada." });
      }

      // Verifica permissões
      if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
        if (req.user.role.startsWith('Diretor')) {
          if (analise.departamentoDono !== req.user.departamento) {
            return res.status(403).json({ error: "Sem permissão para excluir esta análise." });
          }
        } else {
          if (analise.dono.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Sem permissão para excluir esta análise." });
          }
        }
      }

      // Caso queira realmente remover do MongoDB:
      await CV.findByIdAndDelete(idAnalise);

      // No SQLite, marcamos como 'deleted'
      const deleteSQLite = `
        UPDATE cv_analyses
        SET status = 'deleted',
            atualizado_em = ?
        WHERE id = ?
      `;
      await new Promise((resolve, reject) => {
        db.run(deleteSQLite, [
          new Date().toISOString(),
          idAnalise
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ message: "Análise de CV excluída (ou inativada) com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir análise de CV:", error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = cvAnalysisController;
