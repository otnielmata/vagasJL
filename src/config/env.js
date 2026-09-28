require('dotenv').config();

const corsOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((origin) => origin.trim()).filter(Boolean);
const applicationAllowedHosts = (process.env.APPLICATION_ALLOWED_HOSTS || '')
  .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
const applicationAllowedEmailDomains = (process.env.APPLICATION_ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean);

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
    eliminatoryEnabled: (process.env.MATCH_ELIMINATORY_ENABLED ?? 'true') === 'true',
  },
  engagement: {
    apiUrl: process.env.ENGAGEMENT_API_URL || '',
    apiToken: process.env.ENGAGEMENT_API_TOKEN || '',
    timeoutMs: Number(process.env.ENGAGEMENT_API_TIMEOUT_MS || 3000),
    cacheTtlMs: Number(process.env.ENGAGEMENT_CACHE_TTL_MS || 300000),
  },
  // Importacao de vagas do JL Vagas (enriched-dataset.json)
  vacancyImport: {
    url: (process.env.IMPORT_VACANCIES_URL ?? 'https://juliodelima.com.br/vagas/data/enriched-dataset.json').trim(),
    source: (process.env.IMPORT_VACANCIES_SOURCE || 'juliodelima-vagas').trim().toLowerCase(),
    timeoutMs: Number(process.env.IMPORT_VACANCIES_TIMEOUT_MS || 20000),
    closeMissing: (process.env.IMPORT_VACANCIES_CLOSE_MISSING ?? 'true') === 'true',
    languageLevel: (process.env.IMPORT_VACANCIES_LANGUAGE_LEVEL || 'intermediate').trim(),
    // Segredo enviado pela Vercel Cron no header Authorization (Bearer)
    cronSecret: process.env.CRON_SECRET || '',
  },
  application: {
    allowedHosts: applicationAllowedHosts,
    allowedEmailDomains: applicationAllowedEmailDomains,
  },
};

function validateConfig() {
  const errors = [];

  if (config.vacancyImport.url) {
    try {
      if (new URL(config.vacancyImport.url).protocol !== 'https:') throw new Error();
    } catch {
      errors.push('IMPORT_VACANCIES_URL deve ser uma URL HTTPS valida');
    }
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(config.vacancyImport.source)) {
    errors.push('IMPORT_VACANCIES_SOURCE deve conter apenas letras minusculas, numeros, ponto, hifen ou underline');
  }
  if (!Number.isSafeInteger(config.vacancyImport.timeoutMs) || config.vacancyImport.timeoutMs < 1000 ||
      config.vacancyImport.timeoutMs > 60000) {
    errors.push('IMPORT_VACANCIES_TIMEOUT_MS deve ser inteiro entre 1000 e 60000');
  }
  if (!['true', 'false'].includes(process.env.IMPORT_VACANCIES_CLOSE_MISSING ?? 'true')) {
    errors.push('IMPORT_VACANCIES_CLOSE_MISSING deve ser true ou false');
  }
  if (!['pending', 'mongodb'].includes(config.studentValidation.source)) {
    errors.push('STUDENT_VALIDATION_SOURCE deve ser pending ou mongodb');
  }
  if (!['true', 'false'].includes(process.env.MATCH_ELIMINATORY_ENABLED ?? 'true')) {
    errors.push('MATCH_ELIMINATORY_ENABLED deve ser true ou false');
  }
  if (Boolean(config.engagement.apiUrl) !== Boolean(config.engagement.apiToken)) {
    errors.push('ENGAGEMENT_API_URL e ENGAGEMENT_API_TOKEN devem ser configurados juntos');
  }
  if (config.engagement.apiUrl) {
    try {
      const engagementUrl = new URL(config.engagement.apiUrl);
      if (!['http:', 'https:'].includes(engagementUrl.protocol)) throw new Error();
    } catch {
      errors.push('ENGAGEMENT_API_URL deve ser uma URL HTTP ou HTTPS valida');
    }
  }
  if (!Number.isSafeInteger(config.engagement.timeoutMs) || config.engagement.timeoutMs < 100 ||
      config.engagement.timeoutMs > 30000) {
    errors.push('ENGAGEMENT_API_TIMEOUT_MS deve ser inteiro entre 100 e 30000');
  }
  if (!Number.isSafeInteger(config.engagement.cacheTtlMs) || config.engagement.cacheTtlMs < 0 ||
      config.engagement.cacheTtlMs > 3600000) {
    errors.push('ENGAGEMENT_CACHE_TTL_MS deve ser inteiro entre 0 e 3600000');
  }
  if ([...config.application.allowedHosts, ...config.application.allowedEmailDomains]
    .some((value) => !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value))) {
    errors.push('Hosts e dominios de candidatura devem ser nomes DNS validos');
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
