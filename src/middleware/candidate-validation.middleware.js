const { body, param } = require('express-validator');

function evidenceRule(field, label) {
  return body(field).optional().isString().withMessage(`${label} invalido`).bail()
    .isLength({ min: 1, max: 256 }).withMessage(`${label} invalido`).bail()
    .custom((value) => value.trim().length > 0).withMessage(`${label} invalido`);
}

function candidateValidationRules() {
  const allowedFields = ['purchaseCode', 'trustedIdentifier'];
  return [
    param('id').isMongoId().withMessage('Identificador de candidato invalido'),
    body().custom((value) => value === undefined || (
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every((field) => allowedFields.includes(field))
    )).withMessage('Campos de validacao invalidos'),
    evidenceRule('purchaseCode', 'Codigo de compra'),
    evidenceRule('trustedIdentifier', 'Identificador confiavel'),
  ];
}

module.exports = candidateValidationRules;
