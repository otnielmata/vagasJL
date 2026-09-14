/**
 * Trata qualquer rota nao mapeada, retornando um 404 padronizado.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    message: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = notFoundHandler;
