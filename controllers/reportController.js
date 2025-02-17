const { Candidate } = require('../models/candidateModel');
const { CVAnalysis } = require('../models/cvAnalysisModel');
const { User } = require('../models/userModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');

/**
 * Função auxiliar para calcular datas de início e fim
 * de acordo com o período (semana, mês ou ano).
 */
function calcularPeriodo(filtroPeriodo) {
  const hoje = new Date();
  let dataInicio;
  let dataFim;

  switch (filtroPeriodo) {
    case 'mes':
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
      break;
    case 'ano':
      dataInicio = new Date(hoje.getFullYear(), 0, 1);
      dataFim = new Date(hoje.getFullYear() + 1, 0, 1);
      break;
    default:
      // Por padrão, considera a semana atual (segunda a domingo)
      const diaSemana = hoje.getDay(); // 0 = domingo, 1 = segunda...
      // Ajusta para começar na segunda-feira
      const diffSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
      dataInicio = new Date(hoje);
      dataInicio.setHours(0, 0, 0, 0);
      dataInicio.setDate(hoje.getDate() - diffSegunda);

      dataFim = new Date(dataInicio);
      dataFim.setDate(dataFim.getDate() + 7);
      break;
  }

  return { dataInicio, dataFim };
}

/**
 * Verifica qual filtro aplicar de acordo com a role do usuário.
 * - Admin e Manager: veem todos os candidatos.
 * - Diretor: filtra pelo departamento do diretor.
 * - Broker: filtra pela equipe associada ao broker.
 * - Recrutador, Employee, Consultor: veem somente os candidatos que eles mesmos gerenciam.
 */
function obterFiltroPorRole(usuario) {
  if (usuario.role === 'Admin' || usuario.role === 'Manager') {
    return {};
  }

  // Se for Diretor, filtra por departamento
  if (usuario.role.startsWith('Diretor')) {
    // No candidateModel, supomos que exista um campo "departamento" ou "departamento" no "responsaveis" 
    // ou algo que indique que o candidato está associado ao mesmo departamento.
    // Exemplo simples:
    return { departamento: usuario.departamento };
  }

  // Se for Broker, pode filtrar pela equipe associada ao broker
  if (usuario.role === 'Broker') {
    // Supondo que cada candidato tenha "brokerEquipaId" ou algo similar
    return { brokerEquipaId: usuario._id };
  }

  // Se for Recrutador, Employee ou Consultor, 
  // filtra pelos candidatos em que esse usuário está em "responsaveis"
  if (['Recrutador', 'Employee', 'Consultor'].includes(usuario.role)) {
    // No candidateModel, "responsaveis" é um array de objetos { userId, data_atribuicao, status }
    // Então precisamos buscar: "responsaveis.userId" = usuario._id
    return { 'responsaveis.userId': usuario._id };
  }

  // Caso não se encaixe em nada, retorna filtro vazio ou algo que retorne zero
  return { 'responsaveis.userId': usuario._id };
}

/**
 * reportController: gera métricas para o dashboard, funil de conversão e ranking.
 */
const reportController = {
  /**
   * GET /api/reports/dashboard?period=semana|mes|ano
   * Retorna métricas do dashboard. Exemplo:
   * - Número de candidatos criados no período
   * - Contagem de status do pipeline (leads, entrevistas, recrutados, etc.)
   * - Quantos CVs foram analisados no período, pontuação média, etc.
   */
  getDashboard: async (req, res) => {
    const filtroPeriodo = req.query.period || 'semana';
    console.log(`GET: /api/reports/dashboard?period=${filtroPeriodo}`);
    try {
      const { dataInicio, dataFim } = calcularPeriodo(filtroPeriodo);
      const filtroRole = obterFiltroPorRole(req.user);

      // 1) Busca candidatos criados no período, de acordo com o filtro de role
      const candidatos = await Candidate.find({
        ...filtroRole,
        createdAt: { $gte: dataInicio, $lt: dataFim }
      });

      // Exemplo de contagens
      const totalCandidatos = candidatos.length;
      const recrutados = candidatos.filter(c => c.pipeline_status === 'recrutado').length;
      const leads = candidatos.filter(c => c.pipeline_status === 'lead').length;
      const entrevistas = candidatos.filter(c => c.pipeline_status === 'entrevista').length;
      const inativos = candidatos.filter(c => c.pipeline_status === 'inativo').length;

      // 2) Busca análises de CV no período
      // Exemplo: filtra por "analisadoPor" ou "dono" e createdAt
      // Se o user for Admin/Manager, pode ver todos. Se for Recrutador, filtra por "dono" ou "analisadoPor" = user._id
      let filtroCV = {};
      if (req.user.role === 'Admin' || req.user.role === 'Manager') {
        filtroCV = { createdAt: { $gte: dataInicio, $lt: dataFim } };
      } else if (req.user.role.startsWith('Diretor')) {
        // Se seu cvAnalysisModel tiver "departamentoDono", por exemplo
        filtroCV = {
          departamentoDono: req.user.departamento,
          createdAt: { $gte: dataInicio, $lt: dataFim }
        };
      } else if (['Recrutador', 'Employee', 'Consultor', 'Broker'].includes(req.user.role)) {
        filtroCV = {
          dono: req.user._id,
          createdAt: { $gte: dataInicio, $lt: dataFim }
        };
      }

      const analisesCV = await CVAnalysis.find(filtroCV);

      const totalAnalisesCV = analisesCV.length;
      const somaPontuacao = analisesCV.reduce((acc, item) => acc + (item.pontuacao || 0), 0);
      const pontuacaoMedia = totalAnalisesCV > 0 ? (somaPontuacao / totalAnalisesCV) : 0;

      // Monta objeto de métricas do dashboard
      const metricas = {
        periodo: filtroPeriodo,
        dataInicio,
        dataFim,
        candidatos: {
          total: totalCandidatos,
          leads,
          entrevistas,
          recrutados,
          inativos
        },
        cvAnalises: {
          totalAnalises: totalAnalisesCV,
          pontuacaoMedia: Math.round(pontuacaoMedia * 100) / 100 // arredonda p/ 2 casas
        }
      };

      // Opcional: Registrar no SQLite
      const querySQLite = `
        INSERT INTO relatorios_dashboard (
          user_id, periodo, data_inicio, data_fim,
          total_candidatos, leads, entrevistas, recrutados, inativos,
          total_analises_cv, pontuacao_media_cv, gerado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [
          req.user._id.toString(),
          filtroPeriodo,
          dataInicio.toISOString(),
          dataFim.toISOString(),
          totalCandidatos,
          leads,
          entrevistas,
          recrutados,
          inativos,
          totalAnalisesCV,
          pontuacaoMedia,
          new Date().toISOString()
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ metricas });
    } catch (error) {
      console.error("Erro ao obter métricas do dashboard:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/reports/funnel?period=semana|mes|ano
   * Gera o funil de conversão (identificação, lead, chamada, agendamento, entrevista, recrutado, inativo).
   * Filtra pelo período e pela role do usuário.
   */
  getFunnel: async (req, res) => {
    const filtroPeriodo = req.query.period || 'semana';
    console.log(`GET: /api/reports/funnel?period=${filtroPeriodo}`);
    try {
      const { dataInicio, dataFim } = calcularPeriodo(filtroPeriodo);
      const filtroRole = obterFiltroPorRole(req.user);

      // Busca candidatos dentro do período
      const candidatos = await Candidate.find({
        ...filtroRole,
        createdAt: { $gte: dataInicio, $lt: dataFim }
      });

      // Contagem de cada status
      const identificacao = candidatos.filter(c => c.pipeline_status === 'identificacao').length;
      const lead = candidatos.filter(c => c.pipeline_status === 'lead').length;
      const chamadas = candidatos.filter(c => c.pipeline_status === 'chamada').length;
      const agendamentos = candidatos.filter(c => c.pipeline_status === 'agendamento').length;
      const entrevistas = candidatos.filter(c => c.pipeline_status === 'entrevista').length;
      const recrutados = candidatos.filter(c => c.pipeline_status === 'recrutado').length;
      const inativados = candidatos.filter(c => c.pipeline_status === 'inativo').length;

      const funil = {
        periodo: filtroPeriodo,
        dataInicio,
        dataFim,
        identificacao,
        lead,
        chamadas,
        agendamentos,
        entrevistas,
        recrutados,
        inativados
      };

      // Registrar no SQLite (opcional)
      const querySQLite = `
        INSERT INTO relatorios_funil (
          user_id, periodo, data_inicio, data_fim,
          identificacao, lead, chamadas, agendamentos, entrevistas, recrutados, inativados,
          gerado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [
          req.user._id.toString(),
          filtroPeriodo,
          dataInicio.toISOString(),
          dataFim.toISOString(),
          identificacao,
          lead,
          chamadas,
          agendamentos,
          entrevistas,
          recrutados,
          inativados,
          new Date().toISOString()
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({ funil });
    } catch (error) {
      console.error("Erro ao obter dados do funil:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * GET /api/reports/rankings?month=1..12&year=YYYY
   * Gera o ranking mensal, considerando:
   * - quantos candidatos foram recrutados por cada usuário
   * - quantas análises de CV cada usuário fez no mês
   * Todos podem ver o ranking e em que lugar cada um está.
   */
  getRankings: async (req, res) => {
    console.log(`GET: /api/reports/rankings?month=${req.query.month}&year=${req.query.year}`);
    try {
      const hoje = new Date();
      const month = req.query.month ? parseInt(req.query.month, 10) - 1 : hoje.getMonth();
      const year = req.query.year ? parseInt(req.query.year, 10) : hoje.getFullYear();

      const dataInicio = new Date(year, month, 1);
      const dataFim = new Date(year, month + 1, 1);

      // 1) Contabilizar quantos candidatos foram "recrutados" no período por cada user
      //    Lembrando que "responsaveis" é array de { userId, data_atribuicao, status } 
      //    e pipeline_status = 'recrutado'
      const candidatosRecrutados = await Candidate.find({
        pipeline_status: 'recrutado',
        createdAt: { $gte: dataInicio, $lt: dataFim }
      });

      const contagemRecrutadosPorUser = {};
      candidatosRecrutados.forEach(c => {
        c.responsaveis.forEach(r => {
          const userId = r.userId.toString();
          if (!contagemRecrutadosPorUser[userId]) {
            contagemRecrutadosPorUser[userId] = 0;
          }
          contagemRecrutadosPorUser[userId]++;
        });
      });

      // 2) Contabilizar quantas análises de CV cada user fez no período
      //    (campo analisadoPor e createdAt)
      const analisesCV = await CVAnalysis.find({
        analisadoPor: { $exists: true },
        createdAt: { $gte: dataInicio, $lt: dataFim }
      });

      const contagemAnalisesPorUser = {};
      analisesCV.forEach(cv => {
        const userId = cv.analisadoPor.toString();
        if (!contagemAnalisesPorUser[userId]) {
          contagemAnalisesPorUser[userId] = 0;
        }
        contagemAnalisesPorUser[userId]++;
      });

      // 3) Montar array de ranking
      //    Exemplo: pontuacao = (recrutados * 2) + analisesCV
      const todosUserIds = new Set([
        ...Object.keys(contagemRecrutadosPorUser),
        ...Object.keys(contagemAnalisesPorUser)
      ]);

      const users = await User.find({ _id: { $in: Array.from(todosUserIds) } });
      const rankingArray = users.map(u => {
        const userId = u._id.toString();
        const recrutados = contagemRecrutadosPorUser[userId] || 0;
        const analisesFeitas = contagemAnalisesPorUser[userId] || 0;
        const pontuacao = (recrutados * 2) + analisesFeitas; // Exemplo

        return {
          userId: u._id,
          nome: u.nome,
          email: u.email,
          recrutados,
          analisesFeitas,
          pontuacao
        };
      });

      // Ordena por pontuacao desc
      rankingArray.sort((a, b) => b.pontuacao - a.pontuacao);

      // Atribui posição (1º, 2º, 3º...)
      let posicao = 1;
      let anteriorPontuacao = null;

      rankingArray.forEach((item, index) => {
        if (index === 0) {
          item.posicao = 1;
          anteriorPontuacao = item.pontuacao;
        } else {
          if (item.pontuacao < anteriorPontuacao) {
            posicao = index + 1;
          }
          item.posicao = posicao;
          anteriorPontuacao = item.pontuacao;
        }
      });

      // 4) Registrar no SQLite (opcional)
      const querySQLite = `
        INSERT INTO relatorios_ranking (
          month, year, ranking_data, gerado_em
        ) VALUES (?, ?, ?, ?)
      `;
      await new Promise((resolve, reject) => {
        db.run(querySQLite, [
          month + 1,
          year,
          JSON.stringify(rankingArray),
          new Date().toISOString()
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({
        periodo: { mes: month + 1, ano: year },
        ranking: rankingArray
      });
    } catch (error) {
      console.error("Erro ao obter ranking:", error);
      return res.status(500).json({ error: error.message });
    }
  },

  /**
   * PUT /api/reports/metrics
   * Somente Admin pode alterar manualmente métricas, se precisar.
   * Exemplo fictício de como ajustar algo no SQLite ou no Mongo.
   */
  atualizarMetricas: async (req, res) => {
    console.log("PUT: /api/reports/metrics -", JSON.stringify(req.body));
    try {
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Somente o Admin pode alterar métricas.' });
      }

      // Ajustar manualmente algo no MongoDB ou no SQLite, se necessário
      // Por exemplo:
      // await SomeModel.updateOne(...);

      return res.json({ message: 'Métricas atualizadas com sucesso.' });
    } catch (error) {
      console.error("Erro ao atualizar métricas:", error);
      return res.status(500).json({ error: error.message });
    }
  }
};

module.exports = reportController;
