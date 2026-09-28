const crypto = require('node:crypto');
const config = require('../config/env');
const importService = require('../services/vacancy-import-source.service');

function booleanOption(value, name) {
  if (value === undefined || value === false || value === 'false') return false;
  if (value === true || value === 'true') return true;
  const error = new Error(`${name} deve ser booleano`);
  error.statusCode = 400;
  throw error;
}

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

/** POST /importacoes/vagas/arquivo — master, multipart/form-data. */
async function upload(req, res, next) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Envie um arquivo JSON no campo file' });
    }
    let dataset;
    try {
      dataset = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ message: 'Arquivo JSON invalido' });
    }
    const dryRun = booleanOption(req.body?.dryRun, 'dryRun');
    const activatePending = booleanOption(req.body?.activatePending, 'activatePending');
    if (dryRun && activatePending) {
      return res.status(400).json({ message: 'dryRun e activatePending nao podem ser usados juntos' });
    }
    const importacao = await importService.syncVacancyImport({ dryRun, dataset });
    const publicacao = activatePending ? await importService.activatePendingImported(req.user) : undefined;
    return res.status(200).json({
      arquivo: { nome: req.file.originalname, tamanho: req.file.size },
      importacao,
      ...(publicacao ? { publicacao } : {}),
    });
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

module.exports = { sync, upload, cron, booleanOption };
