require('dotenv').config();

/**
 * Configuracao central da aplicacao, lida a partir das variaveis de ambiente.
 * Mantem um unico ponto de leitura do process.env para o restante do codigo.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vagas-jl',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  },
};

function validateConfig() {
  const missing = [];

  if (!config.jwt.secret) {
    missing.push('JWT_SECRET');
  }

  if (missing.length > 0 && config.env !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Atencao: variaveis de ambiente ausentes: ${missing.join(', ')}. ` +
        'Configure o arquivo .env com base no .env.example.'
    );
  }
}

validateConfig();

module.exports = config;
