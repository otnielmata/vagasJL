const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/vacancy.controller');

const router = Router();

router.patch('/:id/status', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.updateStatus);

module.exports = router;
