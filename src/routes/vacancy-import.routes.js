const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/vacancy-import.controller');

const router = Router();

// Importacao do enriched-dataset.json do JL Vagas
router.post('/vagas/sincronizar', authenticate, authorize('admin'), ensureDatabase, controller.sync);
router.get('/vagas/sincronizar', ensureDatabase, controller.cron);

module.exports = router;
