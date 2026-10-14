const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const controller = require('../controllers/master-directory.controller');

const router = Router();

router.get('/empresas', authenticate, authorize('master'), ensureDatabase, controller.listCompanies);
router.get('/recrutadores', authenticate, authorize('master'), ensureDatabase, controller.listRecruiters);
router.get('/candidatos', authenticate, authorize('master'), ensureDatabase, controller.listCandidates);

module.exports = router;
