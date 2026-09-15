const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const candidateRules = require('../middleware/candidate.middleware');
const validate = require('../middleware/validate.middleware');
const ensureDatabase = require('../middleware/database.middleware');
const candidateController = require('../controllers/candidate.controller');

const router = Router();

router.post('/', authenticate, candidateRules(),
  (req, res, next) => validate(req, res, next, 400), ensureDatabase, candidateController.register);

module.exports = router;
