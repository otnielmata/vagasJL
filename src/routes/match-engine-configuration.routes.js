const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/match-engine-configuration.controller');

const router = Router();

router.get('/match', authenticate, authorize('master'), ensureDatabase, controller.show);
router.put('/match/:version', authenticate, authorize('master'), ensureDatabase, controller.publish);

module.exports = router;
