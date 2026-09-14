const app = require('./src/app');
const connectDB = require('./src/config/db');
const config = require('./src/config/env');

/**
 * Ponto de entrada da aplicacao: conecta ao MongoDB e sobe o servidor HTTP.
 */
async function start() {
  await connectDB();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Vagas JL API rodando em ${config.baseUrl} (env: ${config.env})`);
    // eslint-disable-next-line no-console
    console.log(`[server] Documentacao Swagger disponivel em ${config.baseUrl}/api-docs`);
  });

  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[server] Recebido ${signal}, encerrando servidor...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[server] Falha ao iniciar a aplicacao:', error);
  process.exit(1);
});
