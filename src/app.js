const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const ensureDatabase = require('./middleware/database.middleware');
const setupSwagger = require('./config/swagger');
const routes = require('./routes');
const registrationRoutes = require('./routes/registration.routes');
const loginRoutes = require('./routes/login.routes');
const candidateRoutes = require('./routes/candidate.routes');
const companyRoutes = require('./routes/company.routes');
const adminCompanyRoutes = require('./routes/admin-company.routes');
const adminCandidateRoutes = require('./routes/admin-candidate.routes');
const adminVacancyRoutes = require('./routes/admin-vacancy.routes');
const vacancyRoutes = require('./routes/vacancy.routes');
const matchProfileConfigurationRoutes = require('./routes/match-profile-configuration.routes');
const importImportanceConfigurationRoutes = require('./routes/import-importance-configuration.routes');
const matchMultipliersConfigurationRoutes = require('./routes/match-multipliers-configuration.routes');
const rankingThresholdConfigurationRoutes = require('./routes/ranking-threshold-configuration.routes');
const profileCompletionThresholdConfigurationRoutes =
  require('./routes/profile-completion-threshold-configuration.routes');
const matchEngineConfigurationRoutes = require('./routes/match-engine-configuration.routes');
const masterCatalogRoutes = require('./routes/master-catalog.routes');
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

app.use(['/api/auth', '/api/users'], ensureDatabase);

// Rotas da API
app.use('/api', routes);
app.use('/usuarios', registrationRoutes);
app.use('/login', loginRoutes);
app.use('/candidatos', candidateRoutes);
app.use('/empresas', companyRoutes);
app.use('/admin/empresas', adminCompanyRoutes);
app.use('/admin/candidatos', adminCandidateRoutes);
app.use('/admin/vagas', adminVacancyRoutes);
app.use('/vagas', vacancyRoutes);
app.use('/perfil-match', matchProfileConfigurationRoutes);
app.use('/configuracoes', importImportanceConfigurationRoutes);
app.use('/configuracoes', matchMultipliersConfigurationRoutes);
app.use('/configuracoes', rankingThresholdConfigurationRoutes);
app.use('/configuracoes', profileCompletionThresholdConfigurationRoutes);
app.use('/admin/configuracoes', matchEngineConfigurationRoutes);
app.use('/admin/catalogos', masterCatalogRoutes);

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
