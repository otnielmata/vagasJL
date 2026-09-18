const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const candidateRules = require('../middleware/candidate.middleware');
const candidateValidationRules = require('../middleware/candidate-validation.middleware');
const candidateReadRules = require('../middleware/candidate-read.middleware');
const candidateUpdateRules = require('../middleware/candidate-update.middleware');
const candidateDeleteRules = require('../middleware/candidate-delete.middleware');
const validate = require('../middleware/validate.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const candidateController = require('../controllers/candidate.controller');
const matchProfileController = require('../controllers/candidate-match-profile.controller');

const router = Router();

router.get('/me/vagas/ranking', authenticate, authorize('candidate'), ensureDatabase,
  candidateController.rankVacancies);

router.post('/me/perfil-match', authenticate, authorize('candidate'), ensureDatabase, matchProfileController.register);

router.post('/', authenticate, authorize('candidate'), candidateRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.register);

router.get('/:id', authenticate, authorize('candidate', 'company'), candidateReadRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.show);

router.patch('/:id', authenticate, authorize('candidate'), candidateUpdateRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.update);

router.delete('/:id', authenticate, authorize('candidate'), candidateDeleteRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.remove);

router.post('/:id/validacao', authenticate, authorize('candidate'), candidateValidationRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.validateEligibility);

module.exports = router;
