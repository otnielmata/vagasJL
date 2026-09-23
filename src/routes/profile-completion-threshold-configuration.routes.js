const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/profile-completion-threshold-configuration.controller');

const router = Router();
router.put('/match/completude-minima', authenticate, authorize('admin'), ensureDatabase,
  controller.publish);

module.exports = router;
