const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/master-catalog.controller');

const router = Router();

router.put('/:category/:id', authenticate, authorize('admin'), ensureDatabase, controller.publish);

module.exports = router;
