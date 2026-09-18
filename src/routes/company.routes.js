const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/company.controller');

const router = Router();

router.post('/', authenticate, authorize('admin'), ensureDatabase, controller.register);

module.exports = router;
