const { Router } = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/vacancy-import.controller');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const jsonName = typeof file.originalname === 'string' && file.originalname.toLowerCase().endsWith('.json');
    const jsonType = ['application/json', 'text/json', 'application/octet-stream'].includes(file.mimetype);
    callback(jsonName && jsonType ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'), jsonName && jsonType);
  },
});

// Importacao do enriched-dataset.json do JL Vagas
router.post('/vagas/arquivo', authenticate, authorize('master'), upload.single('file'), ensureDatabase, controller.upload);
router.post('/vagas/sincronizar', authenticate, authorize('master'), ensureDatabase, controller.sync);
router.get('/vagas/sincronizar', ensureDatabase, controller.cron);

module.exports = router;
