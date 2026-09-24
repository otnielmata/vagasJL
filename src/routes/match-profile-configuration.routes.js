const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/match-profile-configuration.controller');
const testTypeController = require('../controllers/test-type-catalog.controller');

const router = Router();

router.put('/configuracao', authenticate, authorize('admin'), ensureDatabase, controller.publish);
router.put('/catalogos/tipos-de-teste', authenticate, authorize('admin'), ensureDatabase, testTypeController.publish);

module.exports = router;
