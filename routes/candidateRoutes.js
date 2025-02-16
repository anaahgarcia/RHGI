const express = require('express');
const router = express.Router();
const CandidateController = require('../controllers/candidateController');
const { verifyToken } = require('../middleware');
const multer = require('multer');

// Configuração do Multer para upload de arquivos
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

// Middleware de autenticação para todas as rotas
router.use(verifyToken);

// Rotas de CRUD básico
router.post('/', CandidateController.createCandidate);
router.get('/', CandidateController.getCandidates);
router.get('/:id', CandidateController.getCandidate);
router.put('/:id', CandidateController.updateCandidate);

// Rotas de interação e gerenciamento
router.post('/:id/interaction', CandidateController.addInteraction);
router.put('/:id/inactivate', CandidateController.inactivateCandidate);

// Rotas de documentos
router.post('/:id/documents', upload.single('file'), CandidateController.uploadDocument);
router.get('/:id/documents/:type', CandidateController.downloadDocument);

module.exports = router;