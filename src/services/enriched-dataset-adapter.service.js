const crypto = require('node:crypto');
const { BOOLEAN_MATCH_FIELDS, isUnknownSeniority } = require('../config/match-profile');
const { normalizeCatalogAlias } = require('../config/master-catalog');

/**
 * Adaptador do enriched-dataset.json publicado pelo JL Vagas (juliodelima.com.br/vagas)
 * para o lote de conciliacao da importacao (VJ-69). Cada item vira uma vaga IMPORTED
 * identificada pelo ID externo; valores sao convertidos para os IDs canonicos da
 * configuracao publicada do Perfil de Match. Valores sem correspondencia nao derrubam
 * a vaga: sao omitidos e contabilizados em `unmapped` para ampliar o catalogo.
 */
const ENRICHED_DATASET_ADAPTER_VERSION = 'JL_ENRICHED_V2';

// Campo do JSON -> campo canonico com lista de opcoes.
const LIST_FIELDS = Object.freeze({
  testAutomationTechnologies: ['testAutomationTechnologies', 'testAutomationTecnologies'],
  qaTools: ['qaTools', 'tecnologies', 'technologies'],
  programmingLanguages: ['programmingLanguages'],
  genAITools: ['genAITools', 'genAITecnologies'],
});
const SINGLE_FIELDS = Object.freeze({
  type: ['type'],
  level: ['level'],
  role: ['role'],
  classification: ['classification'],
  specialization: ['specialization', 'especialization'],
});
const LANGUAGE_FIELDS = Object.freeze(['english', 'spanish']);
const UNKNOWN_VALUES = new Set(['desconhecido', 'desconhecida', 'unknown', 'outros', 'outro', 'other',
  'others', 'naoidentificado', 'na', 'n/a', '']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function catalogIndex(configuration) {
  const index = new Map();
  for (const field of configuration?.fields || []) {
    const names = new Map();
    for (const option of field.options || []) {
      for (const name of [option.id, option.label, ...(option.aliases || [])]) {
        names.set(normalizeCatalogAlias(String(name)), option.id);
      }
    }
    index.set(field.key, { names, options: field.options || [] });
  }
  return index;
}

function firstPresent(raw, keys) {
  const key = keys.find((name) => Object.hasOwn(raw, name));
  return key === undefined ? undefined : raw[key];
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/\n?\s*Show more\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 10000);
}

function cleanOptionalText(value, maxLength = 200) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function parseLocation(value) {
  const rawLocation = cleanOptionalText(value, 2000);
  if (!rawLocation) return null;
  const withoutModality = rawLocation.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const parts = withoutModality.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    return ['brasil', 'brazil'].includes(normalizeCatalogAlias(parts[0]))
      ? { country: parts[0] } : { city: parts[0] };
  }
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  return { city: parts[0], state: parts.slice(1, -1).join(', '), country: parts.at(-1) };
}

function sourceData(raw, rawUrl) {
  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    rawLocation: cleanOptionalText(raw.location, 2000),
    rawApplicationUrl: rawUrl,
    skillsRequiredCounter: numeric(raw.skillsRequiredCounter),
    testingRelatedKeywords: Array.isArray(raw.testingRelatedKeywords)
      ? raw.testingRelatedKeywords.filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim().slice(0, 100)).slice(0, 200)
      : [],
    amountOfTestingRelatedKeywords: numeric(raw.amountOfTestingRelatedKeywords),
    amountOfGenAITools: numeric(raw.amountOfGenAITools),
    hasGenAI: typeof raw.hasGenAI === 'boolean' ? raw.hasGenAI : null,
    isTestingRelated: typeof raw.isTestingRelated === 'boolean' ? raw.isTestingRelated : null,
  };
}

function isUnknown(value) {
  return typeof value !== 'string' || UNKNOWN_VALUES.has(normalizeCatalogAlias(value));
}

/**
 * @param raw item do enriched-dataset.json
 * @param index resultado de catalogIndex(configuracao publicada)
 * @param options.languageLevel ID usado quando o JSON so indica que o idioma e exigido (true)
 */
function adaptEnrichedItem(raw, index, { languageLevel = 'intermediate', allowedHosts = null } = {}) {
  const unmapped = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { skipped: 'INVALID_ITEM', unmapped };
  const sourceId = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).trim() : '';
  if (!sourceId) return { skipped: 'MISSING_ID', unmapped };
  if (raw.reasonToBeRemoved) return { sourceId, skipped: 'REMOVED_BY_SOURCE', unmapped };
  if (raw.isTestingRelated === false) return { sourceId, skipped: 'NOT_TESTING_RELATED', unmapped };
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '';
  const description = cleanDescription(raw.description);
  if (!title || !description) return { sourceId, skipped: 'MISSING_TITLE_OR_DESCRIPTION', unmapped };

  const resolve = (field, value) => {
    const entry = index.get(field);
    const id = entry?.names.get(normalizeCatalogAlias(String(value)));
    if (!id) unmapped.push({ field, value: String(value).trim().slice(0, 100) });
    return id;
  };
  const values = {};

  for (const field of BOOLEAN_MATCH_FIELDS) {
    if (raw[field] === true) {
      const options = index.get(field)?.options || [];
      if (options.length === 1) values[field] = { identified: true, id: options[0].id };
      else unmapped.push({ field, value: 'true' });
    } else if (raw[field] === false) {
      values[field] = false;
    }
  }

  for (const field of LANGUAGE_FIELDS) {
    const value = raw[field];
    if (value === true) {
      const id = resolve(field, languageLevel);
      if (id) values[field] = { identified: true, id };
    } else if (value === false) {
      values[field] = false;
    } else if (typeof value === 'string' && !isUnknown(value)) {
      const id = resolve(field, value);
      if (id) values[field] = { identified: true, id };
    }
  }

  const years = Number(raw.yearsOfExperience);
  if (Number.isFinite(years) && years > 0 && years <= 100) {
    values.yearsOfExperience = { identified: true, value: Math.round(years * 10) / 10 };
  }

  for (const [field, keys] of Object.entries(SINGLE_FIELDS)) {
    const value = firstPresent(raw, keys);
    if (value === undefined || value === null || value === false || isUnknown(value)) continue;
    if (field === 'level' && isUnknownSeniority(value)) continue;
    const id = resolve(field, value);
    if (id) values[field] = [{ identified: true, id }];
  }

  for (const [field, keys] of Object.entries(LIST_FIELDS)) {
    const list = firstPresent(raw, keys);
    if (!Array.isArray(list)) continue;
    const ids = new Set();
    for (const value of list) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const id = resolve(field, value);
      if (id) ids.add(id);
    }
    if (ids.size) values[field] = [...ids].sort().slice(0, 50).map((id) => ({ identified: true, id }));
  }

  const rawUrl = typeof raw.url === 'string' && /^https:\/\//i.test(raw.url.trim()) ? raw.url.trim() : null;
  let url = rawUrl;
  // Host fora de APPLICATION_ALLOWED_HOSTS: a vaga entra sem canal em vez de ser recusada.
  if (url && Array.isArray(allowedHosts)) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ''; }
    if (!allowedHosts.includes(host)) {
      unmapped.push({ field: 'applicationChannel', value: host || 'url invalida' });
      url = null;
    }
  }
  const location = parseLocation(raw.location);
  const content = {
    reference: `jl-${normalizeCatalogAlias(sourceId).replace(/[^a-z0-9]/g, '') || sha256(sourceId).slice(0, 16)}`
      .slice(0, 100),
    title,
    description,
    sourceCompanyName: cleanOptionalText(raw.company),
    importSourceData: sourceData(raw, rawUrl),
    ...(url ? { applicationChannel: { type: 'https_url', value: url } } : {}),
    ...(location ? { location } : {}),
    matchProfile: { values },
  };
  return {
    sourceId,
    item: { sourceId, sourceVersion: sha256(stableJson(raw)).slice(0, 40), content },
    unmapped,
  };
}

/** Converte o JSON inteiro em itens de lote + resumo do que foi descartado ou nao mapeado. */
function adaptEnrichedDataset(dataset, configuration, options = {}) {
  if (!Array.isArray(dataset)) {
    const error = new Error('O enriched-dataset.json deve ser uma lista de vagas');
    error.statusCode = 422;
    throw error;
  }
  const index = catalogIndex(configuration);
  const items = [];
  const skipped = {};
  const unmapped = new Map();
  const seen = new Set();
  for (const raw of dataset) {
    const result = adaptEnrichedItem(raw, index, options);
    for (const entry of result.unmapped) {
      const key = `${entry.field}:${normalizeCatalogAlias(entry.value)}`;
      const current = unmapped.get(key) || { field: entry.field, value: entry.value, count: 0 };
      current.count += 1;
      unmapped.set(key, current);
    }
    if (result.skipped) {
      skipped[result.skipped] = (skipped[result.skipped] || 0) + 1;
      continue;
    }
    if (seen.has(result.sourceId)) {
      skipped.DUPLICATE_ID = (skipped.DUPLICATE_ID || 0) + 1;
      continue;
    }
    seen.add(result.sourceId);
    items.push(result.item);
  }
  return {
    adapterVersion: ENRICHED_DATASET_ADAPTER_VERSION,
    received: dataset.length,
    items,
    skipped,
    unmapped: [...unmapped.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field)),
  };
}

module.exports = { adaptEnrichedDataset, adaptEnrichedItem, catalogIndex, cleanDescription, parseLocation,
  ENRICHED_DATASET_ADAPTER_VERSION, sha256, stableJson };
