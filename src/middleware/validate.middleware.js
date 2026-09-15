const { validationResult } = require('express-validator');

/**
 * Executa as regras de validacao do express-validator registradas na rota
 * e interrompe a requisicao com o status informado (422 por padrao) caso alguma falhe.
 */
function validate(req, res, next, statusCode = 422) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(statusCode).json({
      message: 'Erro de validacao',
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }

  return next();
}

module.exports = validate;
