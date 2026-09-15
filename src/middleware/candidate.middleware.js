const { body } = require('express-validator');
const { UNKNOWN, PROFILE_FIELDS } = require('../config/candidate');

function candidateRules() {
  const evidenceFields = ['purchaseCode', 'trustedIdentifier'];
  const allowedFields = ['name', 'email', ...evidenceFields, ...PROFILE_FIELDS];
  const urlFields = ['photoUrl', 'linkedinUrl', 'githubUrl', 'portfolioUrl'];
  return [
    body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every((field) => allowedFields.includes(field)))
      .withMessage('Campos de cadastro invalidos'),
    body('name').isString().withMessage('O nome e obrigatorio').bail().trim()
      .isLength({ min: 1, max: 200 }).withMessage('O nome deve ter entre 1 e 200 caracteres'),
    body('email').isString().withMessage('Email invalido').bail().trim()
      .isEmail().withMessage('Email invalido').bail().toLowerCase(),
    ...PROFILE_FIELDS.map((field) => body(field).optional({ values: 'null' })
      .isString().withMessage('O campo deve ser um texto ou null').bail().trim()
      .isLength({ min: 1, max: field === 'professionalSummary' ? 5000 : 2048 })
      .withMessage('Texto vazio ou acima do limite permitido')),
    ...urlFields.map((field) => body(field).optional({ values: 'null' })
      .if((value) => value !== UNKNOWN)
      .isURL({ protocols: ['http', 'https'], require_protocol: true, allow_auth: false })
      .withMessage('Informe uma URL HTTP ou HTTPS valida')),
    body('phone').optional({ values: 'null' }).if((value) => value !== UNKNOWN)
      .matches(/^\+?[0-9 ().-]{6,40}$/).withMessage('Telefone invalido'),
    body('availability').optional({ values: 'null' })
      .isIn(['available', 'unavailable', UNKNOWN]).withMessage('Disponibilidade invalida'),
    ...evidenceFields.map((field) => body(field).optional()
      .isString().withMessage('Comprovante de aluno invalido').bail()
      .isLength({ min: 1, max: 256 }).withMessage('Comprovante de aluno invalido').bail()
      .custom((value) => value.trim().length > 0).withMessage('Comprovante de aluno invalido')),
  ];
}

module.exports = candidateRules;
