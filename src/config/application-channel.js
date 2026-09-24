const config = require('./env');
const ApiError = require('../errors/api.error');

const CHANNEL_TYPES = Object.freeze(['https_url', 'email']);
const REDIRECT_PARAMETERS = new Set(['continue', 'next', 'redirect', 'redirect_uri', 'return', 'target', 'url']);

function allowed(value, entries) {
  return entries.includes(value.toLowerCase());
}

function normalizeApplicationChannel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'type,value' ||
      !CHANNEL_TYPES.includes(input.type) || typeof input.value !== 'string' ||
      !input.value.trim() || input.value.length > 2000) {
    throw new ApiError(400, 'Canal de candidatura invalido');
  }
  if (input.type === 'email') {
    const value = input.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new ApiError(400, 'E-mail de candidatura invalido');
    }
    const domain = value.slice(value.lastIndexOf('@') + 1);
    if (!config.application.allowedEmailDomains.length) {
      throw new ApiError(503, 'Politica de dominios de candidatura nao configurada');
    }
    if (!allowed(domain, config.application.allowedEmailDomains)) {
      throw new ApiError(400, 'Dominio de candidatura nao permitido');
    }
    return { type: 'email', value };
  }

  let parsed;
  try {
    parsed = new URL(input.value.trim());
  } catch {
    throw new ApiError(400, 'URL de candidatura invalida');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash ||
      parsed.port && parsed.port !== '443' || [...parsed.searchParams.keys()]
        .some((key) => REDIRECT_PARAMETERS.has(key.toLowerCase()))) {
    throw new ApiError(400, 'URL de candidatura insegura');
  }
  if (!config.application.allowedHosts.length) {
    throw new ApiError(503, 'Politica de hosts de candidatura nao configurada');
  }
  if (!allowed(parsed.hostname, config.application.allowedHosts)) {
    throw new ApiError(400, 'Host de candidatura nao permitido');
  }
  return { type: 'https_url', value: parsed.toString() };
}

function safeChannelReference(channel) {
  if (channel.type === 'email') return channel.value.slice(channel.value.lastIndexOf('@') + 1);
  return new URL(channel.value).hostname;
}

module.exports = { CHANNEL_TYPES, normalizeApplicationChannel, safeChannelReference };
