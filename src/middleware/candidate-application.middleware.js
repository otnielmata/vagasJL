const { body, param } = require('express-validator');

function candidateApplicationRules() {
  return [
    param('id').isMongoId().withMessage('Identificador da vaga invalido'),
    body().custom((value) => value === undefined || value && typeof value === 'object' &&
      !Array.isArray(value) && Object.keys(value).length === 0)
      .withMessage('Esta operacao nao aceita dados no corpo'),
  ];
}

module.exports = candidateApplicationRules;
