const { body } = require('express-validator');
const { PUBLIC_PROFILE_FIELDS } = require('../config/candidate-public-profile');

function candidatePublicProfileRules() {
  return [
    body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every((field) => ['enabled', 'fields'].includes(field)) &&
      Object.prototype.hasOwnProperty.call(value, 'enabled'))
      .withMessage('Configuracao de perfil publico invalida'),
    body('enabled').isBoolean({ strict: true }).withMessage('enabled deve ser booleano'),
    body('fields').optional().isArray({ max: PUBLIC_PROFILE_FIELDS.length })
      .withMessage('fields deve ser uma lista valida').bail()
      .custom((fields, { req }) => {
        if (!req.body.enabled) return fields.length === 0;
        return fields.length > 0 && new Set(fields).size === fields.length &&
          fields.every((field) => PUBLIC_PROFILE_FIELDS.includes(field));
      }).withMessage('Selecione campos publicos permitidos e sem duplicidade'),
    body().custom((value) => value.enabled ? Array.isArray(value.fields) && value.fields.length > 0
      : value.fields === undefined || value.fields.length === 0)
      .withMessage('A publicacao exige campos e a revogacao nao aceita campos'),
  ];
}

module.exports = candidatePublicProfileRules;
