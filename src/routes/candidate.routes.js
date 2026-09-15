const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const candidateRules = require('../middleware/candidate.middleware');
const candidateValidationRules = require('../middleware/candidate-validation.middleware');
const candidateReadRules = require('../middleware/candidate-read.middleware');
const validate = require('../middleware/validate.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const candidateController = require('../controllers/candidate.controller');

const router = Router();

router.post('/', authenticate, authorize('candidate'), candidateRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.register);

router.get('/:id', authenticate, authorize('candidate', 'company'), candidateReadRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.show);

router.post('/:id/validacao', authenticate, authorize('candidate'), candidateValidationRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.validateEligibility);

module.exports = router;
