const { param } = require('express-validator');

function userReadRules() {
  return [
    param('id').isMongoId().withMessage('Identificador de usuario invalido'),
  ];
}

module.exports = userReadRules;
