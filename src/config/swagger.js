const path = require('path');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const config = require('./env');

const swaggerDocumentPath = path.join(__dirname, '..', 'docs', 'swagger.yaml');
const swaggerDocument = YAML.load(swaggerDocumentPath);

// Mantem a URL base do servidor Swagger sincronizada com o ambiente atual
if (Array.isArray(swaggerDocument.servers)) {
  swaggerDocument.servers = [{ url: config.baseUrl, description: `Ambiente: ${config.env}` }];
}

/**
 * Registra a interface do Swagger (/api-docs) e o JSON bruto da especificacao (/api-docs.json).
 */
function setupSwagger(app) {
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'Vagas JL API - Documentacao',
    })
  );
}

module.exports = setupSwagger;
