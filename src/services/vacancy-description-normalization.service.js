const crypto = require('node:crypto');
const Vacancy = require('../models/vacancy.model');
const Configuration = require('../models/match-profile-configuration.model');
const { normalizeCatalogAlias } = require('../config/master-catalog');
const { validateRequirements } = require('./vacancy-requirements.service');
const { ensureCompanyAuthorized } = require('./vacancy-status.service');
const { getEffectiveMatchEngineConfiguration } =
  require('./match-engine-configuration.service');
const ApiError = require('../errors/api.error');

const EXTRACTOR_VERSION = 'DESCRIPTION_EXTRACTOR_V1';
const OBJECT_ID = /^[a-f\d]{24}$/i;
const TOKEN = /[A-Za-zÀ-ÿ0-9+#/][A-Za-zÀ-ÿ0-9+#/._-]*/g;
const UNKNOWN_LIST = /(?:ferramentas?|tecnologias?|frameworks?|skills?|compet[eê]ncias?)\s*:\s*([^\n.;]+)/giu;
const IMPORTANCE = new Set(['required', 'desirable', 'indifferent']);

function plain(value) {
  return value && typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true, versionKey: false }) : value;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function suggestionId(field, originalValue, canonicalId, sourceStart) {
  return fingerprint([field || 'pending', normalizeCatalogAlias(originalValue),
    canonicalId || 'pending', sourceStart].join(':')).slice(0, 24);
}

function catalog(configuration) {
  const aliases = new Map();
  for (const field of configuration.fields || []) {
    if (field.key === 'yearsOfExperience') continue;
    for (const option of field.options || []) {
      for (const value of [option.id, option.label, ...(option.aliases || [])]) {
        const normalized = normalizeCatalogAlias(value);
        const candidates = aliases.get(normalized) || [];
        if (!candidates.some((candidate) => candidate.field === field.key && candidate.id === option.id)) {
          candidates.push({ field: field.key, id: option.id });
          aliases.set(normalized, candidates);
        }
      }
    }
  }
  return aliases;
}

function tokens(description) {
  return [...description.matchAll(TOKEN)].map((match) => {
    const value = match[0].replace(/[._-]+$/u, '');
    return { value, start: match.index, end: match.index + value.length };
  }).filter((word) => word.value);
}

function knownSuggestions(description, aliases) {
  const words = tokens(description);
  const matches = [];
  for (let start = 0; start < words.length; start += 1) {
    for (let length = Math.min(5, words.length - start); length >= 1; length -= 1) {
      const end = start + length - 1;
      const originalValue = description.slice(words[start].start, words[end].end);
      const candidates = aliases.get(normalizeCatalogAlias(originalValue));
      if (!candidates) continue;
      matches.push({ originalValue, start: words[start].start, end: words[end].end, candidates });
      break;
    }
  }
  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const occupied = [];
  const seen = new Set();
  const suggestions = [];
  for (const match of matches) {
    if (occupied.some(([start, end]) => match.start < end && match.end > start)) continue;
    occupied.push([match.start, match.end]);
    if (match.candidates.length !== 1) {
      const key = `pending:${normalizeCatalogAlias(match.originalValue)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ id: suggestionId(null, match.originalValue, null, match.start), field: null,
        originalValue: match.originalValue, canonicalId: null, confidence: 0.5,
        origin: 'description', sourceStart: match.start, sourceEnd: match.end,
        extractorVersion: EXTRACTOR_VERSION, catalogStatus: 'pending', state: 'suggested',
        candidates: match.candidates.map((candidate) => ({ field: candidate.field,
          canonicalId: candidate.id })), importance: null, eliminatory: null });
      continue;
    }
    const candidate = match.candidates[0];
    const key = `${candidate.field}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ id: suggestionId(candidate.field, match.originalValue, candidate.id, match.start),
      field: candidate.field, originalValue: match.originalValue, canonicalId: candidate.id,
      confidence: 1, origin: 'description', sourceStart: match.start, sourceEnd: match.end,
      extractorVersion: EXTRACTOR_VERSION, catalogStatus: 'matched', state: 'suggested',
      candidates: [], importance: null, eliminatory: null });
  }
  return suggestions;
}

function pendingSuggestions(description, aliases, known) {
  const pending = [];
  const seen = new Set(known.map((item) => normalizeCatalogAlias(item.originalValue)));
  for (const match of description.matchAll(UNKNOWN_LIST)) {
    const listStart = match.index + match[0].indexOf(match[1]);
    let searchOffset = 0;
    for (const raw of match[1].split(/,|\s+e\s+/iu)) {
      const value = raw.trim();
      if (!value || value.length > 100) continue;
      const normalized = normalizeCatalogAlias(value);
      const relative = match[1].indexOf(raw, searchOffset);
      searchOffset = relative + raw.length;
      if (!normalized || aliases.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      const start = listStart + relative + raw.indexOf(value);
      pending.push({ id: suggestionId(null, value, null, start), field: null,
        originalValue: value, canonicalId: null, confidence: 0, origin: 'description',
        sourceStart: start, sourceEnd: start + value.length, extractorVersion: EXTRACTOR_VERSION,
        catalogStatus: 'pending', candidates: [], state: 'suggested', importance: null,
        eliminatory: null });
    }
  }
  return pending;
}

function extractSuggestions(description, configuration) {
  const aliases = catalog(configuration);
  const known = knownSuggestions(description, aliases);
  return [...known, ...pendingSuggestions(description, aliases, known)]
    .sort((left, right) => left.sourceStart - right.sourceStart || left.id.localeCompare(right.id))
    .slice(0, 200);
}

function publicDraft(value) {
  const draft = plain(value);
  return { revision: draft.revision, extractorVersion: draft.extractorVersion,
    configurationVersion: draft.configurationVersion, status: draft.status,
    suggestions: draft.suggestions.map((suggestion) => ({ ...plain(suggestion) })),
    createdAt: draft.createdAt, updatedAt: draft.updatedAt, publishedAt: draft.publishedAt || null,
    recalculation: draft.recalculation || null };
}

function validateRequest(actor, id, input) {
  if (!actor || !['admin', 'company'].includes(actor.role)) throw new ApiError(403, 'Acesso negado');
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) throw new ApiError(400, 'Identificador da vaga invalido');
  const body = input === undefined ? {} : input;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Solicitacao de normalizacao invalida');
  }
  const action = body.action || 'extract';
  if (!['extract', 'review', 'publish'].includes(action)) {
    throw new ApiError(400, 'Acao de normalizacao invalida');
  }
  return { action, body };
}

async function loadAuthorizedVacancy(actor, id) {
  const vacancy = await Vacancy.findById(id).select('+createdBy +deletedAt +normalizationRevision '
    + '+normalizationDraft +normalizationHistory');
  if (!vacancy || vacancy.deletedAt) throw new ApiError(404, 'Vaga nao encontrada');
  if (actor.role === 'company') {
    if (vacancy.origin !== 'COMPANY') throw new ApiError(403, 'Acesso negado a esta vaga');
    await ensureCompanyAuthorized(actor, vacancy);
  }
  return vacancy;
}

function revisionFilter(vacancy) {
  return vacancy.normalizationRevision
    ? vacancy.normalizationRevision : { $in: [null, 0] };
}

function historyUpdate(vacancy) {
  return vacancy.normalizationDraft ? { normalizationHistory: plain(vacancy.normalizationDraft) } : {};
}

async function saveDraft(vacancy, draft, set = {}, push = {}) {
  const updated = await Vacancy.findOneAndUpdate({ _id: vacancy._id, updatedAt: vacancy.updatedAt,
    normalizationRevision: revisionFilter(vacancy), deletedAt: null }, {
    $set: { ...set, normalizationDraft: draft, normalizationRevision: draft.revision },
    ...(vacancy.normalizationDraft || Object.keys(push).length
      ? { $push: { ...historyUpdate(vacancy), ...push } } : {}),
  }, { new: true, runValidators: true }).select('+normalizationDraft +normalizationRevision');
  if (!updated) throw new ApiError(409, 'Normalizacao alterada simultaneamente; tente novamente');
  return publicDraft(updated.normalizationDraft);
}

async function extract(vacancy, configuration, now) {
  const descriptionFingerprint = fingerprint(vacancy.description);
  const current = plain(vacancy.normalizationDraft);
  if (current?.descriptionFingerprint === descriptionFingerprint &&
      current.extractorVersion === EXTRACTOR_VERSION) return publicDraft(current);
  const revision = (vacancy.normalizationRevision || 0) + 1;
  return saveDraft(vacancy, { revision, descriptionFingerprint, extractorVersion: EXTRACTOR_VERSION,
    configurationVersion: configuration.version, status: 'draft',
    suggestions: extractSuggestions(vacancy.description, configuration), createdAt: now,
    updatedAt: now, reviewedBy: null, publishedAt: null, recalculation: null });
}

function reviewedSuggestions(current, body) {
  if (!Number.isSafeInteger(body.revision) || body.revision !== current.revision ||
      !Array.isArray(body.decisions) || !body.decisions.length || body.decisions.length > 200 ||
      Object.keys(body).some((key) => !['action', 'revision', 'decisions'].includes(key))) {
    throw new ApiError(400, 'Revisao de normalizacao invalida');
  }
  const decisions = new Map();
  for (const decision of body.decisions) {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
        typeof decision.id !== 'string' || !['accepted', 'rejected'].includes(decision.state) ||
        decisions.has(decision.id)) throw new ApiError(400, 'Decisao de normalizacao invalida');
    const accepted = decision.state === 'accepted';
    const keys = Object.keys(decision).sort().join(',');
    const acceptedKeys = ['eliminatory', 'id', 'importance', 'state'].sort().join(',');
    const choiceKeys = ['canonicalId', 'eliminatory', 'field', 'id', 'importance', 'state']
      .sort().join(',');
    if ((!accepted && keys !== 'id,state') || (accepted && ![acceptedKeys, choiceKeys].includes(keys)) ||
        accepted && (!IMPORTANCE.has(decision.importance) || typeof decision.eliminatory !== 'boolean' ||
          decision.eliminatory && decision.importance === 'indifferent')) {
      throw new ApiError(400, 'Decisao de normalizacao invalida');
    }
    decisions.set(decision.id, decision);
  }
  const suggestions = current.suggestions.map((suggestion) => {
    const value = plain(suggestion);
    const decision = decisions.get(value.id);
    if (!decision) return value;
    let reviewed = value;
    if (decision.state === 'accepted' && value.catalogStatus !== 'matched') {
      const selected = value.candidates?.find((candidate) => candidate.field === decision.field &&
        candidate.canonicalId === decision.canonicalId);
      if (!selected) throw new ApiError(409, 'Termo pendente exige cadastro ou escolha valida no Catalogo Mestre');
      reviewed = { ...value, field: selected.field, canonicalId: selected.canonicalId,
        catalogStatus: 'matched' };
    } else if (decision.state === 'accepted' &&
        (Object.hasOwn(decision, 'field') || Object.hasOwn(decision, 'canonicalId'))) {
      throw new ApiError(400, 'Sugestao inequivoca nao aceita substituicao de ID');
    }
    decisions.delete(value.id);
    return { ...reviewed, state: decision.state,
      importance: decision.state === 'accepted' ? decision.importance : null,
      eliminatory: decision.state === 'accepted' ? decision.eliminatory : null };
  });
  if (decisions.size) throw new ApiError(400, 'Sugestao de normalizacao inexistente');
  return suggestions;
}

async function review(actor, vacancy, body, now) {
  const current = plain(vacancy.normalizationDraft);
  if (!current || current.status !== 'draft') throw new ApiError(409, 'Rascunho de normalizacao inexistente');
  const suggestions = reviewedSuggestions(current, body);
  const revision = (vacancy.normalizationRevision || 0) + 1;
  return saveDraft(vacancy, { ...current, revision, suggestions, updatedAt: now,
    reviewedBy: actor.id });
}

function publishableProfile(vacancy, current, configuration) {
  const accepted = current.suggestions.filter((suggestion) => suggestion.state === 'accepted');
  if (!accepted.length) throw new ApiError(409, 'Nenhuma sugestao aceita para publicacao');
  const fields = new Map(configuration.fields.map((field) => [field.key,
    new Set(field.options.map((option) => option.id))]));
  const values = { ...plain(vacancy.matchProfile.values) };
  const requirements = (vacancy.matchProfile.requirements || []).map((item) => plain(item));
  for (const suggestion of accepted) {
    if (!suggestion.field || !suggestion.canonicalId ||
        !fields.get(suggestion.field)?.has(suggestion.canonicalId)) {
      throw new ApiError(409, 'Sugestao aceita nao pertence ao Catalogo Mestre publicado');
    }
    values[suggestion.field] = [...new Set([...(values[suggestion.field] || []),
      suggestion.canonicalId])].sort();
    const key = `${suggestion.field}:${suggestion.canonicalId}`;
    const next = { field: suggestion.field, id: suggestion.canonicalId,
      importance: suggestion.importance, eliminatory: suggestion.eliminatory === true };
    const index = requirements.findIndex((item) => `${item.field}:${item.id}` === key);
    if (index === -1) requirements.push(next); else requirements[index] = next;
  }
  return { configurationVersion: configuration.version, values,
    requirements: validateRequirements(requirements, values, configuration, vacancy.status === 'active') };
}

async function recalculation(now) {
  const engine = await getEffectiveMatchEngineConfiguration(now);
  const policy = engine?.recalculationPolicy || 'affected_matches';
  const scheduled = policy === 'affected_matches';
  return { policy, status: scheduled ? 'scheduled' : 'not_required',
    scheduledFor: scheduled ? now : null, engineVersion: engine?.version || null };
}

async function publish(actor, vacancy, body, configuration, now) {
  const current = plain(vacancy.normalizationDraft);
  if (!current || current.status !== 'draft' || !Number.isSafeInteger(body.revision) ||
      body.revision !== current.revision || typeof body.reason !== 'string' || !body.reason.trim() ||
      body.reason.trim().length > 500 ||
      Object.keys(body).sort().join(',') !== 'action,reason,revision') {
    throw new ApiError(400, 'Publicacao de normalizacao invalida');
  }
  const matchProfile = publishableProfile(vacancy, current, configuration);
  const publicationRecalculation = await recalculation(now);
  const revision = (vacancy.normalizationRevision || 0) + 1;
  const requirementsRevision = (vacancy.requirementsRevision || 0) + 1;
  const draft = { ...current, revision, configurationVersion: configuration.version,
    status: 'published', updatedAt: now, reviewedBy: actor.id, publishedAt: now,
    recalculation: publicationRecalculation };
  return saveDraft(vacancy, draft, { matchProfile, requirementsRevision }, {
    requirementsHistory: { at: now, actor: actor.id, process: 'api', reason: body.reason.trim(),
      revision: requirementsRevision, requirements: matchProfile.requirements },
  });
}

async function normalizeVacancyDescription(actor, id, input, now = new Date()) {
  const request = validateRequest(actor, id, input);
  const vacancy = await loadAuthorizedVacancy(actor, id.toLowerCase());
  if (['removed', 'rejected'].includes(vacancy.status)) throw new ApiError(409, 'Vaga encerrada');
  const configuration = await Configuration.findOne().sort({ version: -1 });
  if (!configuration) throw new ApiError(503, 'Catalogo Mestre publicado indisponivel');
  if (request.action === 'extract') {
    if (Object.keys(request.body).some((key) => key !== 'action')) {
      throw new ApiError(400, 'Solicitacao de normalizacao invalida');
    }
    return extract(vacancy, configuration, now);
  }
  if (request.action === 'review') return review(actor, vacancy, request.body, now);
  return publish(actor, vacancy, request.body, configuration, now);
}

module.exports = { normalizeVacancyDescription, extractSuggestions, reviewedSuggestions,
  publishableProfile, EXTRACTOR_VERSION };
