require('dotenv').config();

const corsOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((origin) => origin.trim()).filter(Boolean);

/**
 * Configuracao central da aplicacao, lida a partir das variaveis de ambiente.
 * Mantem um unico ponto de leitura do process.env para o restante do codigo.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vagas-jl',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  cors: {
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  },
  studentValidation: {
    source: process.env.STUDENT_VALIDATION_SOURCE || 'pending',
  },
  match: {
    desirableFactor: Number(process.env.MATCH_DESIRABLE_FACTOR ?? '0.5'),
    eliminatoryEnabled: (process.env.MATCH_ELIMINATORY_ENABLED ?? 'true') === 'true',
  },
};

function validateConfig() {
  const errors = [];

  if (!['pending', 'mongodb'].includes(config.studentValidation.source)) {
    errors.push('STUDENT_VALIDATION_SOURCE deve ser pending ou mongodb');
  }
  if (!Number.isFinite(config.match.desirableFactor) || config.match.desirableFactor <= 0 ||
      config.match.desirableFactor >= 1) {
    errors.push('MATCH_DESIRABLE_FACTOR deve ser maior que 0 e menor que 1');
  }
  if (!['true', 'false'].includes(process.env.MATCH_ELIMINATORY_ENABLED ?? 'true')) {
    errors.push('MATCH_ELIMINATORY_ENABLED deve ser true ou false');
  }

  if (!config.jwt.secret || Buffer.byteLength(config.jwt.secret) < 32 || config.jwt.secret.startsWith('troque-')) {
    errors.push('JWT_SECRET deve conter um segredo proprio de pelo menos 32 bytes');
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('PORT deve ser um inteiro entre 1 e 65535');
  }

  if (!/^[1-9]\d*(ms|s|m|h|d|w|y)$/.test(config.jwt.expiresIn)) {
    errors.push('JWT_EXPIRES_IN deve ser uma duracao positiva com unidade, como 30m, 1h ou 7d');
  }

  if (!/^mongodb(?:\+srv)?:\/\//.test(config.mongodb.uri)) {
    errors.push('MONGODB_URI deve ser uma URI MongoDB');
  }

  try {
    const baseUrl = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error();
  } catch {
    errors.push('BASE_URL deve ser uma URL HTTP ou HTTPS valida');
  }

  if (errors.length > 0) {
    throw new Error(`Configuracao invalida: ${errors.join('; ')}. Consulte .env.example.`);
  }
}

validateConfig();

module.exports = config;
