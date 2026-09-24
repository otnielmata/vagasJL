const { body } = require('express-validator');
const { CONTACT_DISPLAY_FIELDS, FORMATION_DISPLAY_FIELDS } =
  require('../config/candidate-display-permissions');

function categoryRule(name, allowed) {
  return body(name).optional().isArray({ max: allowed.length })
    .withMessage(`${name} deve ser uma lista valida`).bail()
    .custom((fields) => new Set(fields).size === fields.length &&
      fields.every((field) => typeof field === 'string' && allowed.includes(field)))
    .withMessage(`${name} contem campo nao permitido ou duplicado`);
}

function candidateDisplayPermissionsRules() {
  return [
    body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every((field) => ['contact', 'formation'].includes(field)))
      .withMessage('Permissoes de exibicao invalidas'),
    categoryRule('contact', CONTACT_DISPLAY_FIELDS),
    categoryRule('formation', FORMATION_DISPLAY_FIELDS),
  ];
}

module.exports = candidateDisplayPermissionsRules;
