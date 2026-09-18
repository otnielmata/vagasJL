const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/company.controller');

const router = Router();

router.post('/', authenticate, authorize('admin'), ensureDatabase, controller.register);
router.post('/:id/usuarios', authenticate, authorize('admin'), ensureDatabase, controller.addUser);
router.patch('/:id/cadastro', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.updateRegistration);
router.get('/:id/cadastro', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.showRegistration);
router.delete('/:id/cadastro', authenticate, authorize('admin', 'company'), ensureDatabase,
  controller.removeRegistration);

module.exports = router;
