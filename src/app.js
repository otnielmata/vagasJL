const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const setupSwagger = require('./config/swagger');
const routes = require('./routes');
const notFoundHandler = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/error.middleware');

const app = express();

// Middlewares de seguranca e utilitarios
app.use(helmet());
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (config.env !== 'test') {
  app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
}

// Documentacao Swagger (/api-docs e /api-docs.json)
setupSwagger(app);

// Rotas da API
app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Vagas JL API',
    docs: '/api-docs',
    health: '/api/health',
  });
});

// 404 para rotas nao mapeadas
app.use(notFoundHandler);

// Handler central de erros (deve ser o ultimo middleware)
app.use(errorHandler);

module.exports = app;
