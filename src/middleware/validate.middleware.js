const { validationResult } = require('express-validator');

/**
 * Executa as regras de validacao do express-validator registradas na rota
 * e interrompe a requisicao com 422 caso alguma falhe.
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: 'Erro de validacao',
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }

  return next();
}

module.exports = validate;
