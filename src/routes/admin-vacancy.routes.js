const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/admin-vacancy.controller');

const router = Router();

router.put('/:id', authenticate, authorize('admin'), ensureDatabase, controller.manage);

module.exports = router;
