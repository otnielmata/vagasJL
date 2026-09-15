const { body } = require('express-validator');

function loginRules() {
  return [
    body('email').isString().withMessage('Email invalido').bail()
      .trim().isEmail().withMessage('Email invalido').bail().toLowerCase(),
    body('password').isString().withMessage('A senha deve ser um texto').bail()
      .notEmpty().withMessage('A senha e obrigatoria')
      .custom((password) => Buffer.byteLength(password) <= 72)
      .withMessage('A senha deve ter no maximo 72 bytes'),
  ];
}

module.exports = loginRules;
