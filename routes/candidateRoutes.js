const express = require('express');
const router = express.Router();
const CandidateController = require('../controllers/candidateController');
const { verifyToken, checkRole } = require('../middleware');
const multer = require('multer');

// Configuração do Multer para upload de arquivos
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(pdf|doc|docx|jpg|jpeg|png)$/)) {
            return cb(new Error('Por favor, envie apenas arquivos nos formatos permitidos.'));
        }
        cb(undefined, true);
    }
});

// Middleware de autenticação para todas as rotas
router.use(verifyToken);

// Rotas de CRUD básico
router.post('/', CandidateController.createCandidate);
router.get('/', CandidateController.getCandidates);
router.get('/:id', CandidateController.getCandidate);
router.put('/:id', CandidateController.updateCandidate);

// Rotas de status e pipeline
router.put('/:id/status', CandidateController.updateCandidateStatus);
router.put('/:id/inactivate', CandidateController.inactivateCandidate);

// Rotas de interação
router.post('/:id/interaction', CandidateController.addInteraction);

// Rotas de documentos (CV e Carta de Motivação)
router.post('/:id/documents', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const { tipo } = req.body;
        if (!tipo || !['cv', 'carta_motivacao', 'outro'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo de documento inválido' });
        }

        const documentData = {
            tipo,
            nome: req.file.originalname,
            data: req.file.buffer,
            mimeType: req.file.mimetype,
            uploadadoPor: req.user._id
        };

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

        candidate.documentos.push(documentData);
        
        if (tipo === 'cv') {
            candidate.cv_analisado = false;
        }

        candidate.historico.push({
            tipo: 'sistema',
            conteudo: `Documento ${tipo} enviado: ${req.file.originalname}`,
            data: new Date(),
            autor: req.user._id
        });

        await candidate.save();

        // Registrar no SQLite
        const sqliteQuery = `
            INSERT INTO documentos (
                candidato_id,
                tipo,
                nome,
                mime_type,
                uploadado_em,
                uploadado_por
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        await new Promise((resolve, reject) => {
            db.run(sqliteQuery, [
                req.params.id,
                tipo,
                req.file.originalname,
                req.file.mimetype,
                new Date().toISOString(),
                req.user._id.toString()
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.status(201).json({ message: 'Documento enviado com sucesso' });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rota para marcar CV como analisado
router.put('/:id/cv-analyzed', async (req, res) => {
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

        candidate.cv_analisado = true;
        candidate.historico.push({
            tipo: 'sistema',
            conteudo: 'CV marcado como analisado',
            data: new Date(),
            autor: req.user._id
        });

        await candidate.save();

        // Atualizar SQLite
        const sqliteQuery = `
            UPDATE candidatos 
            SET cv_analisado = 1,
                atualizado_em = ?,
                atualizado_por = ?
            WHERE id = ?
        `;

        await new Promise((resolve, reject) => {
            db.run(sqliteQuery, [
                new Date().toISOString(),
                req.user._id.toString(),
                req.params.id
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ message: 'CV marcado como analisado' });
    } catch (error) {
        console.error('Error marking CV as analyzed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rota para adicionar/atualizar skills
router.put('/:id/skills', async (req, res) => {
    try {
        const { skills } = req.body;

        if (!Array.isArray(skills)) {
            return res.status(400).json({ error: 'Skills deve ser um array' });
        }

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

        candidate.skills = skills;
        candidate.historico.push({
            tipo: 'atualizacao',
            conteudo: 'Skills atualizadas',
            data: new Date(),
            autor: req.user._id
        });

        await candidate.save();

        res.json(candidate);
    } catch (error) {
        console.error('Error updating skills:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;