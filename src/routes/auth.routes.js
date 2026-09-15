const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');

const router = Router();

router.post(
  '/register',
  [
    body('name').isString().withMessage('O nome deve ser um texto').bail().trim().notEmpty().withMessage('O nome e obrigatorio'),
    body('email').isString().withMessage('Email invalido').bail().trim().isEmail().withMessage('Email invalido').bail().toLowerCase(),
    body('password').isString().withMessage('A senha deve ser um texto').bail()
      .isLength({ min: 6 }).withMessage('A senha deve ter pelo menos 6 caracteres')
      .custom((password) => Buffer.byteLength(password) <= 72).withMessage('A senha deve ter no maximo 72 bytes'),
    body('role').optional().isString().bail().isIn(['candidate', 'company']).withMessage('Papel (role) invalido'),
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  [
    body('email').isString().withMessage('Email invalido').bail().trim().isEmail().withMessage('Email invalido').bail().toLowerCase(),
    body('password').isString().withMessage('A senha deve ser um texto').bail().notEmpty().withMessage('A senha e obrigatoria')
      .custom((password) => Buffer.byteLength(password) <= 72).withMessage('A senha deve ter no maximo 72 bytes'),
  ],
  validate,
  authController.login
);

module.exports = router;
