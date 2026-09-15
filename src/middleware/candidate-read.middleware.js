const { param } = require('express-validator');

function candidateReadRules() {
  return [
    param('id').isMongoId().withMessage('Identificador de candidato invalido'),
  ];
}

module.exports = candidateReadRules;
