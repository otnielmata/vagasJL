const { body } = require('express-validator');

function candidateOpportunityAvailabilityRules() {
  return [
    body().custom((value) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      Object.prototype.hasOwnProperty.call(value, 'availableForOpportunities'))
      .withMessage('Configuracao de disponibilidade invalida'),
    body('availableForOpportunities').isBoolean({ strict: true })
      .withMessage('availableForOpportunities deve ser booleano'),
  ];
}

module.exports = candidateOpportunityAvailabilityRules;
