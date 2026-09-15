const { body, param } = require('express-validator');
const { UNKNOWN, PROFILE_FIELDS, CANDIDATE_EDITABLE_FIELDS } = require('../config/candidate');

function candidateUpdateRules() {
  const urlFields = ['photoUrl', 'linkedinUrl', 'githubUrl', 'portfolioUrl'];
  return [
    param('id').isMongoId().withMessage('Identificador de candidato invalido'),
    body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length > 0 &&
      Object.keys(value).every((field) => CANDIDATE_EDITABLE_FIELDS.includes(field)))
      .withMessage('Campos de alteracao invalidos'),
    body('name').optional().isString().withMessage('Nome invalido').bail().trim()
      .isLength({ min: 1, max: 200 }).withMessage('O nome deve ter entre 1 e 200 caracteres'),
    body('email').optional().isString().withMessage('Email invalido').bail().trim()
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
  ];
}

module.exports = candidateUpdateRules;
