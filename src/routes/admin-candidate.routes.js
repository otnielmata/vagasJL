const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/candidate-status.controller');

const router = Router();

router.patch('/:id/status', authenticate, authorize('admin'), ensureDatabase, controller.updateStatus);

module.exports = router;
