const { param } = require('express-validator');

function candidateDeleteRules() {
  return [param('id').isMongoId().withMessage('Identificador de candidato invalido')];
}

module.exports = candidateDeleteRules;
