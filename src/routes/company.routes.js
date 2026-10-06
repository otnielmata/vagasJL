const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/company.controller');
const vacancyController = require('../controllers/vacancy.controller');

const router = Router();

router.post('/', authenticate, authorize('master'), ensureDatabase, controller.register);
router.get('/me/cadastro', authenticate, authorize('company'), ensureDatabase,
  controller.showMyRegistration);
router.post('/:id/usuarios', authenticate, authorize('master'), ensureDatabase, controller.addUser);
router.patch('/:id/cadastro', authenticate, authorize('master'), ensureDatabase,
  controller.updateRegistration);
router.get('/:id/cadastro', authenticate, authorize('master'), ensureDatabase,
  controller.showRegistration);
router.delete('/:id/cadastro', authenticate, authorize('master'), ensureDatabase,
  controller.removeRegistration);
router.post('/:id/vagas', authenticate, authorize('company'), ensureDatabase,
  vacancyController.registerCompany);

module.exports = router;
