const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const loginRules = require('../middleware/login.middleware');
const validate = require('../middleware/validate.middleware');
const ensureDatabase = require('../middleware/database.middleware');

const router = Router();

router.post(
  '/',
  loginRules(),
  (req, res, next) => validate(req, res, next, 400),
  ensureDatabase,
  authController.login
);

module.exports = router;
