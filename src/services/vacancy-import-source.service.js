const config = require('../config/env');
const ApiError = require('../errors/api.error');
const Configuration = require('../models/match-profile-configuration.model');
const Vacancy = require('../models/vacancy.model');
const { adaptEnrichedDataset, sha256 } = require('./enriched-dataset-adapter.service');
const { prepareImportedVacancyData } = require('./vacancy-origin.service');
const { reconcileImportBatch } = require('./vacancy-import-reconciliation.service');
const { updateStatus } = require('./vacancy-status.service');

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_ITEMS = 1000;
// Snapshot so fecha vagas ausentes se o arquivo tiver ao menos esta fracao das vagas abertas.
const MIN_SNAPSHOT_RATIO = 0.5;

async function fetchDataset(url = config.vacancyImport.url) {
  if (!url) throw new ApiError(503, 'IMPORT_VACANCIES_URL nao configurada');
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'vagas-jl-importer/1.0' },
      signal: AbortSignal.timeout(config.vacancyImport.timeoutMs),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(502, 'Fonte de vagas indisponivel');
  }
  if (!response.ok) throw new ApiError(502, `Fonte de vagas respondeu HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new ApiError(502, 'Arquivo de vagas excede o limite permitido');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new ApiError(502, 'Arquivo de vagas excede o limite permitido');
  try {
    return { dataset: JSON.parse(text), fingerprint: sha256(text) };
  } catch {
    throw new ApiError(502, 'Fonte de vagas nao retornou JSON valido');
  }
}

function summarizeErrors(errors) {
  const counts = new Map();
  for (const message of errors) counts.set(message, (counts.get(message) || 0) + 1);
  return [...counts].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count);
}

/** Valida cada vaga como a importacao faria, sem gravar nada. */
async function previewItems(items, source) {
  const errors = [];
  const failures = [];
  let valid = 0;
  for (const item of items) {
    try {
      await prepareImportedVacancyData({ source, sourceId: item.sourceId }, item.content);
      valid += 1;
    } catch (error) {
      const message = error.statusCode ? error.message : 'Falha inesperada ao preparar a vaga';
      errors.push(message);
      if (failures.length < 20) failures.push({ sourceId: item.sourceId, message });
    }
  }
  return { valid, invalid: items.length - valid, errors: summarizeErrors(errors), sample: failures };
}

/**
 * Busca o enriched-dataset.json, adapta ao Perfil de Match publicado e concilia as vagas.
 * `dryRun` so valida e devolve o resumo. `dataset` permite testar com um arquivo local.
 */
async function syncVacancyImport({ dryRun = false, dataset: provided, referenceAt = new Date() } = {}) {
  const source = config.vacancyImport.source;
  const fetched = provided ? { dataset: provided, fingerprint: sha256(JSON.stringify(provided)) }
    : await fetchDataset();
  const configuration = await Configuration.findOne().sort({ version: -1 });
  if (!configuration) throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  const adapted = adaptEnrichedDataset(fetched.dataset, configuration,
    { languageLevel: config.vacancyImport.languageLevel, allowedHosts: config.application.allowedHosts });
  const summary = {
    source, url: provided ? null : config.vacancyImport.url, adapterVersion: adapted.adapterVersion,
    configurationVersion: configuration.version, received: adapted.received,
    importable: adapted.items.length, skipped: adapted.skipped, unmapped: adapted.unmapped.slice(0, 50),
  };
  if (dryRun) return { dryRun: true, ...summary, preview: await previewItems(adapted.items, source) };

  const openCount = await Vacancy.countDocuments({ origin: 'IMPORTED', importSource: source,
    status: { $in: ['pending', 'active', 'paused'] } });
  const single = adapted.items.length <= MAX_BATCH_ITEMS;
  const closeMissing = config.vacancyImport.closeMissing && single && adapted.items.length > 0 &&
    adapted.items.length >= Math.ceil(openCount * MIN_SNAPSHOT_RATIO);
  const day = referenceAt.toISOString().slice(0, 10);
  const batches = [];
  for (let start = 0; start < adapted.items.length; start += MAX_BATCH_ITEMS) {
    const items = adapted.items.slice(start, start + MAX_BATCH_ITEMS);
    const batch = {
      source,
      batchId: `${day}-${fetched.fingerprint.slice(0, 16)}-${configuration.version}-${start / MAX_BATCH_ITEMS}`,
      collectionType: closeMissing ? 'snapshot' : 'incremental',
      scope: 'default',
      referenceAt: referenceAt.toISOString(),
      items,
      ...(closeMissing ? { snapshotPolicy: { enabled: true, complete: true, trusted: true,
        missingStatus: 'expired', absentBefore: referenceAt.toISOString() } } : {}),
    };
    batches.push(await reconcileImportBatch(batch));
  }
  const result = batches.reduce((total, batch) => {
    for (const [key, value] of Object.entries(batch.result || {})) total[key] = (total[key] || 0) + value;
    return total;
  }, {});
  return {
    dryRun: false, ...summary, closeMissing,
    closeMissingSkippedReason: config.vacancyImport.closeMissing && !closeMissing
      ? 'Arquivo com poucas vagas em relacao as abertas; nenhuma vaga foi fechada por ausencia' : null,
    result,
    failures: batches.flatMap((batch) => batch.failures || []).slice(0, 50),
    batches: batches.map((batch) => ({ batchId: batch.batchId, status: batch.status, replayed: batch.replayed })),
  };
}

/**
 * Publica (pending -> active) as vagas importadas desta fonte que aguardam revisao.
 * Cada vaga passa pelas mesmas validacoes de publicacao do PATCH /vagas/{id}/status.
 */
async function activatePendingImported(actor, source = config.vacancyImport.source) {
  if (actor?.role !== 'admin') throw new ApiError(403, 'Apenas administradores podem publicar vagas importadas');
  const pending = await Vacancy.find({ origin: 'IMPORTED', importSource: source, status: 'pending',
    deletedAt: null }).select('_id importSourceId').lean();
  const errors = [];
  let activated = 0;
  for (const vacancy of pending) {
    try {
      await updateStatus(actor, String(vacancy._id),
        { status: 'active', reason: `Publicacao em lote da importacao ${source}` });
      activated += 1;
    } catch (error) {
      errors.push(error.statusCode ? error.message : 'Falha inesperada ao publicar');
    }
  }
  return { pending: pending.length, activated, failed: pending.length - activated,
    errors: summarizeErrors(errors) };
}

module.exports = { syncVacancyImport, fetchDataset, previewItems, activatePendingImported };
