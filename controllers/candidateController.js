const multer = require('multer');
const { Contact } = require('../models/candidateModel');
const { User } = require('../models/userModel');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('HRDatabase.db');


// Configuração do multer para upload de documentos
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(pdf|doc|docx|jpg|jpeg|png)$/)) {
            return cb(new Error('Por favor, envie apenas arquivos nos formatos pemitidos'));
        }
        cb(undefined, true);
    }
});

const CandidateController = {
    createCandidate: async (req, res) => {
        console.log("POST: /api/candidates - " + JSON.stringify(req.body));
        let savedCandidate = null;

        try {
            const {
                nome,
                email,
                telefone,
                tipo_contato,
                importancia,
                origem_contato,
                departamento,
                agencia,
                indicacao,
                nivel_indicacao,
                responsavel_indicacao
            } = req.body;

            if (!nome) {
                console.log("Error: Missing required fields");
                return res.status(400).json({ error: "O nome deve ser preenchido." });
            }

            // Verificar se já existe um candidato com EXATAMENTE o mesmo nome, email E telefone
            const existingCandidate = await Contact.findOne({
                nome: nome,
                email: email.toLowerCase(),
                telefone: telefone
            });

            if (existingCandidate) {
                const alreadyResponsible = existingCandidate.responsaveis.some(resp => 
                    resp.userId.toString() === req.user._id.toString()
                );

                if (!alreadyResponsible) {
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

                return res.status(200).json({
                    message: 'Candidato existente associado ao usuário',
                    candidate: existingCandidate
                });
            }

            // Criar o objeto candidato mas ainda não salvar no MongoDB
            const candidate = new Contact({
                nome,
                email: email.toLowerCase(),
                telefone,
                tipo_contato,
                importancia,
                origem_contato,
                departamento,
                agencia,
                status: 'ativo',
                pipeline_status: 'identificacao',
                indicacao: indicacao || false,
                nivel_indicacao,
                responsavel_indicacao,
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
                }],
                metricas: {
                    data_identificacao: new Date(),
                    chamadas: [],
                    agendamentos: [],
                    entrevistas: []
                }
            });

            try {
                // Primeiro salvamos no MongoDB para obter o ID
                savedCandidate = await candidate.save();
                let sqlSuccess = false;
                
                try {
                    // Tentativa de salvar no SQLite
                    const sqliteQuery = `
                        INSERT INTO candidatos (
                            id,
                            nome,
                            email,
                            telefone,
                            status,
                            pipeline_status,
                            indicacao,
                            nivel_indicacao,
                            responsavel_indicacao,
                            responsavel_id,
                            criado_em,
                            criado_por
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    await new Promise((resolve, reject) => {
                        db.run(sqliteQuery, [
                            savedCandidate._id.toString(),
                            nome,
                            email.toLowerCase(),
                            telefone,
                            'ativo',
                            'identificacao',
                            indicacao ? 1 : 0,
                            nivel_indicacao || null,
                            responsavel_indicacao || null,
                            req.user._id.toString(),
                            new Date().toISOString(),
                            req.user._id.toString()
                        ], (err) => {
                            if (err) {
                                console.error("SQLite error:", err);
                                reject(err);
                            } else {
                                sqlSuccess = true;
                                resolve();
                            }
                        });
                    });
                    
                    // Se chegou aqui, o SQLite foi bem-sucedido
                    console.log(`Success: Candidate ${nome} created successfully.`);
                    res.status(201).json(savedCandidate);
                } catch (sqlError) {
                    // Se houve erro no SQLite, excluir do MongoDB
                    console.error("Error inserting into SQLite:", sqlError);
                    if (savedCandidate) {
                        await Contact.findByIdAndDelete(savedCandidate._id);
                        console.log(`MongoDB document deleted: ${savedCandidate._id}`);
                    }
                    throw new Error(`Erro ao salvar no SQLite: ${sqlError.message}`);
                }
            } catch (mongoError) {
                console.error("Error saving to MongoDB or SQLite:", mongoError);
                throw mongoError;
            }
        } catch (error) {
            console.error("Error creating candidate:", error);
            res.status(500).json({ error: error.message });
        }
    },

    getCandidates: async (req, res) => {
        console.log("GET: /api/candidates");
        
        try {
            const query = {
                'responsaveis': {
                    $elemMatch: {
                        userId: req.user._id,
                        status: 'ativo'
                    }
                }
            };

            // Aplicar filtros avançados
            if (req.query.status) query.status = req.query.status;
            if (req.query.pipeline_status) query.pipeline_status = req.query.pipeline_status;
            if (req.query.departamento) query.departamento = req.query.departamento;
            if (req.query.origem_contato) query.origem_contato = req.query.origem_contato;
            if (req.query.localizacao) query.localizacao = req.query.localizacao;
            if (req.query.skills) query.skills = { $in: req.query.skills.split(',') };
            if (req.query.experiencia) query.experiencia = req.query.experiencia;
            if (req.query.cv_analisado !== undefined) query.cv_analisado = req.query.cv_analisado === 'true';

            // Ordenação
            const sort = {};
            if (req.query.sort) {
                const [field, order] = req.query.sort.split(':');
                sort[field] = order === 'desc' ? -1 : 1;
            } else {
                sort.createdAt = -1;
            }

            const candidates = await Contact.find(query)
                .populate('responsaveis.userId', 'nome email')
                .sort(sort);

            console.log(`Success: Retrieved ${candidates.length} candidates`);
            res.json(candidates);
        } catch (error) {
            console.error("Error fetching candidates:", error);
            res.status(500).json({ error: error.message });
        }
    },

    updateCandidateStatus: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`PUT: /api/candidates/${candidateId}/status - ${JSON.stringify(req.body)}`);

        try {
            const { novo_status, observacao } = req.body;

            if (!novo_status) {
                return res.status(400).json({ error: "Novo status é obrigatório" });
            }

            const candidate = await Contact.findOne({
                _id: candidateId,
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

            const old_status = candidate.pipeline_status;
            candidate.pipeline_status = novo_status;

            // Atualizar métricas baseadas no novo status
            if (!candidate.metricas) {
                candidate.metricas = {};
            }

            switch (novo_status) {
                case 'lead':
                    candidate.metricas.data_lead = new Date();
                    break;
                case 'recrutado':
                    candidate.metricas.data_recrutamento = new Date();
                    // Verificar se existe indicação
                    if (candidate.indicacao && candidate.responsavel_indicacao) {
                        // Adicionar notificação para o responsável da indicação
                        await adicionarNotificacaoIndicacao(candidate);
                    }
                    break;
            }

            // Calcular tempo no status anterior
            if (candidate.metricas[`data_${old_status}`]) {
                const tempoNoStatus = new Date() - new Date(candidate.metricas[`data_${old_status}`]);
                candidate.metricas[`tempo_${old_status}`] = tempoNoStatus;
            }

            candidate.historico.push({
                tipo: 'mudanca_status',
                conteudo: `Status alterado de ${old_status} para ${novo_status}${observacao ? ': ' + observacao : ''}`,
                data: new Date(),
                autor: req.user._id
            });

            try {
                // 1. Primeiro tentamos atualizar o SQLite
                const sqliteQuery = `
                    UPDATE candidatos 
                    SET pipeline_status = ?,
                        atualizado_em = ?,
                        atualizado_por = ?
                    WHERE id = ?
                `;

                await new Promise((resolve, reject) => {
                    db.run(sqliteQuery, [
                        novo_status,
                        new Date().toISOString(),
                        req.user._id.toString(),
                        candidateId
                    ], (err) => {
                        if (err) {
                            console.error("SQLite error:", err);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });

                // 2. Se o SQLite for bem-sucedido, salvamos no MongoDB
                await candidate.save();
                res.json(candidate);
            } catch (error) {
                console.error("Error updating databases:", error);
                res.status(500).json({ error: "Erro ao atualizar o status do candidato" });
            }
        } catch (error) {
            console.error("Error updating candidate status:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Função auxiliar para adicionar notificação de indicação
    async adicionarNotificacaoIndicacao(candidate) {
        try {
            // Adicionar notificação para o responsável da indicação
            await Notification.create({
                userId: candidate.responsavel_indicacao,
                tipo: 'indicacao_sucesso',
                conteudo: `Sua indicação para ${candidate.nome} foi recrutada com sucesso! Você receberá sua recompensa em breve.`,
                data: new Date(),
                lida: false
            });
        } catch (error) {
            console.error("Error creating indication notification:", error);
        }
    },

            // Buscar todos os candidatos
            getCandidates: async (req, res) => {
                console.log("GET: /api/candidates");
                
                try {
                    const query = {
                        'responsaveis': {
                            $elemMatch: {
                                userId: req.user._id,
                                status: 'ativo'
                            }
                        }
                    };
        
                    // Aplicar filtros se fornecidos
                    if (req.query.status) query.status = req.query.status;
                    if (req.query.departamento) query.departamento = req.query.departamento;
                    if (req.query.origem_contato) query.origem_contato = req.query.origem_contato;
        
                    const candidates = await Contact.find(query)
                        .populate('responsaveis.userId', 'nome email')
                        .sort({ createdAt: -1 });
        
                    console.log(`Success: Retrieved ${candidates.length} candidates`);
                    res.json(candidates);
                } catch (error) {
                    console.error("Error fetching candidates:", error);
                    res.status(500).json({ error: error.message });
                }
            },

    // Buscar candidato específico
    getCandidate: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`GET: /api/candidates/${candidateId}`);

        try {
            const candidate = await Contact.findOne({
                _id: candidateId,
                'responsaveis': {
                    $elemMatch: {
                        userId: req.user._id,
                        status: 'ativo'
                    }
                }
            }).populate('responsaveis.userId historico.autor', 'nome email');

            if (!candidate) {
                console.log(`Error: Candidate with ID ${candidateId} not found.`);
                return res.status(404).json({ error: 'Candidato não encontrado' });
            }

            console.log(`Success: Retrieved candidate ${candidate.nome}`);
            res.json(candidate);
        } catch (error) {
            console.error("Error fetching candidate:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Atualizar candidato
    updateCandidate: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`PUT: /api/candidates/${candidateId} - ${JSON.stringify(req.body)}`);

        try {
            const candidate = await Contact.findOne({
                _id: candidateId,
                'responsaveis': {
                    $elemMatch: {
                        userId: req.user._id,
                        status: 'ativo'
                    }
                }
            });

            if (!candidate) {
                console.log(`Error: Candidate with ID ${candidateId} not found.`);
                return res.status(404).json({ error: 'Candidato não encontrado' });
            }

            const updates = req.body;
            Object.keys(updates).forEach(key => {
                if (key !== 'responsaveis' && key !== 'historico') {
                    candidate[key] = updates[key];
                }
            });

            candidate.historico.push({
                tipo: 'atualizacao',
                conteudo: 'Informações atualizadas',
                data: new Date(),
                autor: req.user._id
            });

            try {
                // 1. Primeiro tentamos atualizar o SQLite
                const sqliteQuery = `
                UPDATE candidatos 
                SET nome = ?,
                    email = ?,
                    telefone = ?,
                    tipo_contato = ?,
                    importancia = ?,
                    origem_contato = ?,
                    departamento = ?,
                    status = ?,
                    indicacao = ?,
                    nivel_indicacao = ?,
                    responsavel_indicacao = ?,
                    atualizado_em = ?,
                    atualizado_por = ?
                WHERE id = ?
            `;

                await new Promise((resolve, reject) => {
                    db.run(sqliteQuery, [
                        candidate.nome,
                        candidate.email,
                        candidate.telefone,
                        candidate.tipo_contato,
                        candidate.importancia,
                        candidate.origem_contato,
                        candidate.departamento,
                        candidate.status,
                        candidate.indicacao ? 1 : 0,
                        candidate.nivel_indicacao || null,
                        candidate.responsavel_indicacao || null,
                        new Date().toISOString(),
                        req.user._id.toString(),
                        candidateId
                    ], (err) => {
                        if (err) {
                            console.error("SQLite error:", err);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });

                // 2. Se o SQLite for bem-sucedido, salvamos no MongoDB
                await candidate.save();

                console.log(`Success: Candidate ${candidate.nome} updated successfully.`);
                res.json(candidate);
            } catch (error) {
                console.error("Error updating databases:", error);
                res.status(500).json({ error: "Erro ao atualizar o candidato" });
            }
        } catch (error) {
            console.error("Error updating candidate:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Adicionar interação
    addInteraction: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`POST: /api/candidates/${candidateId}/interaction - ${JSON.stringify(req.body)}`);

        try {
            const { tipo, conteudo } = req.body;

            if (!tipo || !conteudo) {
                console.log("Error: Missing required fields for interaction");
                return res.status(400).json({ error: "Tipo e conteúdo são obrigatórios" });
            }

            const candidate = await Contact.findOne({
                _id: candidateId,
                'responsaveis': {
                    $elemMatch: {
                        userId: req.user._id,
                        status: 'ativo'
                    }
                }
            });

            if (!candidate) {
                console.log(`Error: Candidate with ID ${candidateId} not found.`);
                return res.status(404).json({ error: 'Candidato não encontrado' });
            }

            candidate.historico.push({
                tipo,
                conteudo,
                data: new Date(),
                autor: req.user._id
            });

            try {
                // 1. Primeiro tentamos inserir no SQLite
                const sqliteQuery = `
                    INSERT INTO interacoes (
                        candidato_id,
                        tipo,
                        conteudo,
                        autor_id,
                        data
                    ) VALUES (?, ?, ?, ?, ?)
                `;

                await new Promise((resolve, reject) => {
                    db.run(sqliteQuery, [
                        candidateId,
                        tipo,
                        conteudo,
                        req.user._id.toString(),
                        new Date().toISOString()
                    ], (err) => {
                        if (err) {
                            console.error("SQLite error:", err);
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });

                // 2. Se o SQLite for bem-sucedido, salvamos no MongoDB
                await candidate.save();

                console.log(`Success: Interaction added to candidate ${candidate.nome}`);
                res.json({ message: 'Interação registrada com sucesso' });
            } catch (error) {
                console.error("Error during database operations:", error);
                res.status(500).json({ error: "Erro ao registrar interação" });
            }
        } catch (error) {
            console.error("Error adding interaction:", error);
            res.status(500).json({ error: error.message });
        }
    },

    // Inativar candidato
    inactivateCandidate: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`PUT: /api/candidates/${candidateId}/inactivate - ${JSON.stringify(req.body)}`);
    
        try {
            const { motivo } = req.body;
    
            if (!motivo) {
                console.log("Error: Missing reason for inactivation");
                return res.status(400).json({ error: "Motivo da inativação é obrigatório" });
            }
    
            console.log("Verificando candidato no MongoDB...");
            const candidate = await Contact.findOne({
                _id: candidateId,
                'responsaveis': {
                    $elemMatch: {
                        userId: req.user._id,
                        status: 'ativo'
                    }
                }
            });
    
            if (!candidate) {
                console.log(`Error: Candidate with ID ${candidateId} not found.`);
                return res.status(404).json({ error: 'Candidato não encontrado' });
            }
    
            console.log(`Candidato encontrado: ${candidate.nome}`);
    
            // Atualizando o status para inativo
            candidate.status = 'inativo';
            candidate.historico.push({
                tipo: 'inativacao',
                conteudo: `Inativado: ${motivo}`,
                data: new Date(),
                autor: req.user._id
            });
    
            console.log("Salvando candidato no MongoDB...");
            try {
                await candidate.save();
                console.log("Candidato inativado no MongoDB com sucesso.");
            } catch (mongoError) {
                console.error("Erro ao salvar no MongoDB:", mongoError);
                return res.status(500).json({ error: "Erro ao salvar no MongoDB" });
            }
    
            console.log("Tentando atualizar SQLite...");
            const sqliteQuery = `
                UPDATE candidatos 
                SET status = ?, 
                    inativado_em = ?, 
                    inativado_por = ?, 
                    motivo_inativacao = ?
                WHERE id = ?
            `;
    
            try {
                await new Promise((resolve, reject) => {
                    db.run(sqliteQuery, [
                        'inativo',
                        new Date().toISOString(),
                        req.user._id.toString(),
                        motivo,
                        candidateId
                    ], (err) => {
                        if (err) {
                            console.error("Erro ao atualizar SQLite:", err);
                            reject(err);
                        } else {
                            console.log("Candidato inativado no SQLite com sucesso.");
                            resolve();
                        }
                    });
                });
    
                console.log(`Candidato ${candidate.nome} inativado com sucesso em ambos os bancos.`);
                res.json({ message: 'Candidato inativado com sucesso' });
    
            } catch (sqliteError) {
                console.error("Erro ao atualizar SQLite:", sqliteError);
                return res.status(500).json({ error: "Erro ao atualizar SQLite" });
            }
    
        } catch (error) {
            console.error("Erro ao inativar candidato:", error);
            res.status(500).json({ error: error.message });
        }
    },

    getInactiveCandidates: async (req, res) => {
        console.log("GET: /api/candidates/inactive");
    
        try {
            let query = { status: "inativo" }; // Apenas candidatos inativos
    
            // Se for Admin ou Manager, pode acessar todos
            if (req.user.role === "Admin" || req.user.role === "Manager") {
                console.log("Admin/Manager: Acessando todos os candidatos inativos.");
                // Mantemos a query sem restrições adicionais
            } 
            // Se for Recrutador, Employee ou Consultor, só pode ver os seus próprios candidatos
            else if (["Recrutador", "Employee", "Consultor"].includes(req.user.role)) {
                console.log(`Usuário ${req.user.nome} (Recrutador/Employee/Consultor): Acessando seus próprios candidatos.`);
                query["responsaveis.userId"] = req.user._id;
            } 
            // Se for Diretor, acessa todos os candidatos da sua equipe, departamento e agência
            else if (req.user.role.startsWith("Diretor")) {
                console.log(`Diretor ${req.user.nome}: Acessando todos os candidatos da equipe, departamento e agência.`);
                query["departamento"] = req.user.departamento; // Supondo que os candidatos tenham um campo "departamento"
            } 
            // Se for Broker de Equipa, acessa seus candidatos e os da sua equipe
            else if (req.user.role === "Broker de Equipa") {
                console.log(`Broker ${req.user.nome}: Acessando todos os candidatos da sua equipe.`);
                query["responsaveis.userId"] = { $in: [req.user._id, ...(req.user.equipe || [])] }; 
                // Supondo que `req.user.equipe` contenha os IDs dos membros da equipe
            } 
            else {
                console.log(`Usuário ${req.user.nome} não tem permissão para acessar candidatos inativos.`);
                return res.status(403).json({ error: "Acesso negado" });
            }
    
            // Buscar os candidatos inativos com base na query montada
            const candidates = await Contact.find(query)
                .populate("responsaveis.userId", "nome email")
                .sort({ updatedAt: -1 });
    
            console.log(`Success: ${candidates.length} candidatos inativos encontrados.`);
            res.json(candidates);
        } catch (error) {
            console.error("Erro ao buscar candidatos inativos:", error);
            res.status(500).json({ error: error.message });
        }
    },

    reactivateCandidate: async (req, res) => {
        const candidateId = req.params.id;
        console.log(`PUT: /api/candidates/${candidateId}/reactivate`);
    
        try {
            let query = { _id: candidateId, status: "inativo" }; // Apenas candidatos inativos
    
            // Se for Admin ou Manager, pode acessar todos os inativos
            if (req.user.role === "Admin" || req.user.role === "Manager") {
                console.log("Admin/Manager: Acessando todos os candidatos inativos para reativação.");
            } 
            // Se for Recrutador, Employee ou Consultor, só pode reativar os seus próprios candidatos
            else if (["Recrutador", "Employee", "Consultor"].includes(req.user.role)) {
                console.log(`Usuário ${req.user.nome} (Recrutador/Employee/Consultor): Acessando seus próprios candidatos.`);
                query["responsaveis.userId"] = req.user._id;
            } 
            // Se for Diretor, acessa todos os candidatos da sua equipe, departamento e agência
            else if (req.user.role.startsWith("Diretor")) {
                console.log(`Diretor ${req.user.nome}: Acessando todos os candidatos da equipe, departamento e agência.`);
                query["departamento"] = req.user.departamento;
            } 
            // Se for Broker de Equipa, acessa seus candidatos e os da sua equipe
            else if (req.user.role === "Broker de Equipa") {
                console.log(`Broker ${req.user.nome}: Acessando todos os candidatos da sua equipe.`);
                query["responsaveis.userId"] = { $in: [req.user._id, ...(req.user.equipe || [])] };
            } 
            else {
                console.log(`Usuário ${req.user.nome} não tem permissão para reativar candidatos.`);
                return res.status(403).json({ error: "Acesso negado" });
            }
    
            // Buscar o candidato inativo
            const candidate = await Contact.findOne(query);
    
            if (!candidate) {
                console.log(`Error: Candidate with ID ${candidateId} not found or not inativo.`);
                return res.status(404).json({ error: "Candidato não encontrado ou já ativo" });
            }
    
            console.log(`Candidato encontrado: ${candidate.nome}`);
    
            // Atualizando o status para ativo
            candidate.status = "ativo";
            candidate.historico.push({
                tipo: "reativacao",
                conteudo: `Candidato reativado`,
                data: new Date(),
                autor: req.user._id
            });
    
            console.log("Salvando candidato no MongoDB...");
            try {
                await candidate.save();
                console.log("Candidato reativado no MongoDB com sucesso.");
            } catch (mongoError) {
                console.error("Erro ao salvar no MongoDB:", mongoError);
                return res.status(500).json({ error: "Erro ao salvar no MongoDB" });
            }
    
            console.log("Tentando atualizar SQLite...");
            const sqliteQuery = `
                UPDATE candidatos 
                SET status = ?, 
                    atualizado_em = ?, 
                    atualizado_por = ? 
                WHERE id = ?
            `;
    
            try {
                await new Promise((resolve, reject) => {
                    db.run(sqliteQuery, [
                        "ativo",
                        new Date().toISOString(),
                        req.user._id.toString(),
                        candidateId
                    ], (err) => {
                        if (err) {
                            console.error("Erro ao atualizar SQLite:", err);
                            reject(err);
                        } else {
                            console.log("Candidato reativado no SQLite com sucesso.");
                            resolve();
                        }
                    });
                });
    
                console.log(`Candidato ${candidate.nome} reativado com sucesso em ambos os bancos.`);
                res.json({ message: "Candidato reativado com sucesso" });
    
            } catch (sqliteError) {
                console.error("Erro ao atualizar SQLite:", sqliteError);
                return res.status(500).json({ error: "Erro ao atualizar SQLite" });
            }
    
        } catch (error) {
            console.error("Erro ao reativar candidato:", error);
            res.status(500).json({ error: error.message });
        }
    },
    
    
    
};

module.exports = CandidateController;