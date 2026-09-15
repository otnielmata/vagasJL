const { body } = require('express-validator');

function registrationRules() {
  return [
    body('name').isString().withMessage('O nome deve ser um texto').bail()
      .trim().notEmpty().withMessage('O nome e obrigatorio'),
    body('email').isString().withMessage('Email invalido').bail()
      .trim().isEmail().withMessage('Email invalido').bail().toLowerCase(),
    body('password').isString().withMessage('A senha deve ser um texto').bail()
      .isLength({ min: 8 }).withMessage('A senha deve ter pelo menos 8 caracteres')
      .custom((password) => Buffer.byteLength(password) <= 72)
      .withMessage('A senha deve ter no maximo 72 bytes'),
    body('role').optional().isString().bail()
      .isIn(['candidate', 'company']).withMessage('Papel (role) invalido'),
  ];
}

module.exports = registrationRules;
