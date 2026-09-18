const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/match-profile-configuration.controller');

const router = Router();

router.put('/configuracao', authenticate, authorize('admin'), ensureDatabase, controller.publish);

module.exports = router;
