const { body, param } = require('express-validator');

function userUpdateRules() {
  return [
    param('id').isMongoId().withMessage('Identificador de usuario invalido'),
    body().custom((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const fields = Object.keys(value);
      return fields.length > 0 && fields.every((field) => ['name', 'email', 'password'].includes(field));
    }).withMessage('Informe ao menos um campo editavel: name, email ou password'),
    body('name').optional().isString().withMessage('O nome deve ser um texto').bail()
      .trim().notEmpty().withMessage('O nome e obrigatorio'),
    body('email').optional().isString().withMessage('Email invalido').bail()
      .trim().isEmail().withMessage('Email invalido').bail().toLowerCase(),
    body('password').optional().isString().withMessage('A senha deve ser um texto').bail()
      .isLength({ min: 8 }).withMessage('A senha deve ter pelo menos 8 caracteres')
      .custom((password) => Buffer.byteLength(password) <= 72)
      .withMessage('A senha deve ter no maximo 72 bytes'),
  ];
}

module.exports = userUpdateRules;
