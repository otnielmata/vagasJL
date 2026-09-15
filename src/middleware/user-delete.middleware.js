const { param } = require('express-validator');

function userDeleteRules() {
  return [param('id').isMongoId().withMessage('Identificador de usuario invalido')];
}

module.exports = userDeleteRules;
