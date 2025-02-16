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
        if (!file.originalname.match(/\.(pdf|doc|docx)$/)) {
            return cb(new Error('Por favor, envie apenas arquivos PDF ou Word'));
        }
        cb(undefined, true);
    }
});

const CandidateController = {
    // Criar novo candidato
    createCandidate: async (req, res) => {
        console.log("POST: /api/candidates - " + JSON.stringify(req.body));

        try {
            const {
                nome,
                email,
                telefone,
                nif,
                tipo_contato,
                importancia,
                origem_contato,
                departamento,
                agencia
            } = req.body;

            // Verificar campos obrigatórios
            if (!nome || !email || !telefone || !nif) {
                console.log("Error: Missing required fields");
                return res.status(400).json({ error: "Todos os campos obrigatórios devem ser preenchidos." });
            }

            // Verificar se já existe um candidato com mesmo email ou NIF
            const existingCandidate = await Contact.findOne({
                $or: [
                    { email: email.toLowerCase() },
                    { nif: nif }
                ]
            });

            if (existingCandidate) {
                // Adicionar o usuário atual como responsável adicional
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
                    console.log(`Success: User ${req.user.nome} added as responsible for existing candidate ${existingCandidate.nome}`);
                }

                return res.status(200).json({
                    message: 'Candidato existente associado ao usuário',
                    candidate: existingCandidate
                });
            }

            // Criar novo candidato
            const candidate = new Contact({
                nome,
                email: email.toLowerCase(),
                telefone,
                nif,
                tipo_contato,
                importancia,
                origem_contato,
                departamento,
                agencia,
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

            const savedCandidate = await candidate.save();

            // Registrar no SQLite
            const sqliteQuery = `
                INSERT INTO candidatos (
                    id,
                    nome,
                    email,
                    telefone,
                    nif,
                    status,
                    responsavel_id,
                    criado_em,
                    criado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    savedCandidate._id.toString(),
                    nome,
                    email.toLowerCase(),
                    telefone,
                    nif,
                    'ativo',
                    req.user._id.toString(),
                    new Date().toISOString(),
                    req.user._id.toString()
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Candidate ${nome} created successfully.`);
            res.status(201).json(savedCandidate);
        } catch (error) {
            console.error("Error creating candidate:", error);
            res.status(500).json({ error: error.message });
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

            await candidate.save();

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE candidatos 
                SET nome = ?,
                    email = ?,
                    telefone = ?,
                    status = ?,
                    atualizado_em = ?,
                    atualizado_por = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    candidate.nome,
                    candidate.email,
                    candidate.telefone,
                    candidate.status,
                    new Date().toISOString(),
                    req.user._id.toString(),
                    candidateId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Candidate ${candidate.nome} updated successfully.`);
            res.json(candidate);
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

            await candidate.save();

            // Registrar no SQLite
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
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Interaction added to candidate ${candidate.nome}`);
            res.json({ message: 'Interação registrada com sucesso' });
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

            candidate.status = 'inativo';
            candidate.historico.push({
                tipo: 'inativacao',
                conteudo: `Inativado: ${motivo}`,
                data: new Date(),
                autor: req.user._id
            });

            await candidate.save();

            // Atualizar SQLite
            const sqliteQuery = `
                UPDATE candidatos 
                SET status = ?,
                    inativado_em = ?,
                    inativado_por = ?,
                    motivo_inativacao = ?
                WHERE id = ?
            `;

            await new Promise((resolve, reject) => {
                db.run(sqliteQuery, [
                    'inativo',
                    new Date().toISOString(),
                    req.user._id.toString(),
                    motivo,
                    candidateId
                ], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`Success: Candidate ${candidate.nome} inactivated successfully.`);
            res.json({ message: 'Candidato inativado com sucesso' });
        } catch (error) {
            console.error("Error inactivating candidate:", error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = CandidateController;