const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/vacancy.controller');

const router = Router();

router.post('/:id/normalizacao', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.normalizeDescription);
router.get('/:id/candidatos/ranking', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.rankCandidates);
router.patch('/:id/status', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.updateStatus);
router.patch('/:id/requisitos', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.updateRequirements);

module.exports = router;
