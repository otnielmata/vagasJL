const crypto = require('node:crypto');
const config = require('../config/env');
const importService = require('../services/vacancy-import-source.service');

/**
 * POST /importacoes/vagas/sincronizar — admin.
 * { "dryRun": true } so valida; { "activatePending": true } publica as importadas pendentes.
 */
async function sync(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).some((key) => !['dryRun', 'activatePending'].includes(key)) ||
        ['dryRun', 'activatePending'].some((key) => body[key] !== undefined && typeof body[key] !== 'boolean') ||
        (body.dryRun === true && body.activatePending === true)) {
      return res.status(400).json({ message: 'Corpo invalido: use {"dryRun": boolean, "activatePending": boolean}' });
    }
    const importacao = await importService.syncVacancyImport({ dryRun: body.dryRun === true });
    const publicacao = body.activatePending === true ? await importService.activatePendingImported(req.user) : undefined;
    return res.status(200).json({ importacao, ...(publicacao ? { publicacao } : {}) });
  } catch (error) {
    return next(error);
  }
}

function sameSecret(received, expected) {
  const a = Buffer.from(String(received));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** GET /importacoes/vagas/sincronizar — Vercel Cron com Authorization: Bearer CRON_SECRET. */
async function cron(req, res, next) {
  const secret = config.vacancyImport.cronSecret;
  const header = req.get('authorization') || '';
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET nao configurado' });
  if (!header.startsWith('Bearer ') || !sameSecret(header.slice(7), secret)) {
    return res.status(401).json({ message: 'Nao autorizado' });
  }
  return sync({ ...req, body: {} }, res, next);
}

module.exports = { sync, cron };
