const { Router } = require('express');
const userController = require('../controllers/user.controller');
const registrationRules = require('../middleware/registration.middleware');
const validate = require('../middleware/validate.middleware');
const ensureDatabase = require('../middleware/database.middleware');

const router = Router();

router.post(
  '/',
  registrationRules(),
  (req, res, next) => validate(req, res, next, 400),
  ensureDatabase,
  userController.create
);

module.exports = router;
