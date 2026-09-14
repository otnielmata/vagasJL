const config = require('../config/env');

/**
 * Handler central de erros. Deve ser o ultimo middleware registrado no app.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  res.status(statusCode).json({
    message,
    ...(config.env === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
