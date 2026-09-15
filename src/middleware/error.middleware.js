const config = require('../config/env');

/**
 * Handler central de erros. Deve ser o ultimo middleware registrado no app.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message;

  if (err.code === 11000) {
    statusCode = 409;
    message = 'Ja existe um usuario cadastrado com este email';
  } else if (err.name === 'ValidationError' || err.name === 'CastError') {
    statusCode = 422;
    message = 'Dados invalidos';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'JSON invalido';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Corpo da requisicao excede o limite permitido';
  } else if (['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError'].includes(err.name)) {
    statusCode = 503;
    message = 'Banco de dados temporariamente indisponivel';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    message: statusCode >= 500 && statusCode !== 503 ? 'Erro interno do servidor' : message,
    ...(config.env === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
