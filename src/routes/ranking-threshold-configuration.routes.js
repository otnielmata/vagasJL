const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/ranking-threshold-configuration.controller');

const router = Router();
router.put('/match/limiar-ranking', authenticate, authorize('admin'), ensureDatabase,
  controller.publish);

module.exports = router;
