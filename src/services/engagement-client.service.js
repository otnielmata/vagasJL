const config = require('../config/env');

const cache = new Map();
const ROOT_FIELDS = Object.freeze({
  cohort: 'string',
  challengesCompleted: 'number',
  totalChallenges: 'number',
  score: 'number',
  participation: ['string', 'number'],
});
const HISTORY_FIELDS = Object.freeze(['type', 'title', 'status', 'occurredAt', 'score']);
const PROJECT_FIELDS = Object.freeze(['name', 'description', 'url', 'status', 'completedAt']);

function safeScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function authorizedEntries(entries, fields) {
  if (!Array.isArray(entries)) return undefined;
  return entries.slice(0, 500).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const safe = Object.fromEntries(fields.filter((field) => safeScalar(entry[field]))
      .map((field) => [field, entry[field]]));
    return Object.keys(safe).length ? [safe] : [];
  });
}

function authorizedData(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const result = {};
  for (const [field, expected] of Object.entries(ROOT_FIELDS)) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (allowed.includes(typeof payload[field]) &&
        (typeof payload[field] !== 'number' || Number.isFinite(payload[field]))) {
      result[field] = payload[field];
    }
  }
  const history = authorizedEntries(payload.history, HISTORY_FIELDS);
  const projects = authorizedEntries(payload.projects, PROJECT_FIELDS);
  if (history !== undefined) result.history = history;
  if (projects !== undefined) result.projects = projects;
  return Object.keys(result).length ? result : null;
}

function validReferenceAt(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function response(status, data, referenceAt, retrievedAt, cacheHit, ttlMs, reason = null) {
  return { status, readOnly: true, data, referenceAt, retrievedAt,
    cache: { hit: cacheHit, ttlSeconds: ttlMs / 1000 }, ...(reason ? { reason } : {}) };
}

async function fetchOfficialEngagement(studentIdentifier, options = {}) {
  const settings = options.settings || config.engagement;
  const fetchImpl = options.fetchImpl || global.fetch;
  const now = options.now || new Date();
  const key = String(studentIdentifier || '').trim().toLowerCase();
  if (!key) return response('no_data', null, null, now.toISOString(), false,
    settings.cacheTtlMs, 'student_link_missing');
  if (!settings.apiUrl || !settings.apiToken || typeof fetchImpl !== 'function') {
    return response('unavailable', null, null, now.toISOString(), false,
      settings.cacheTtlMs, 'integration_not_configured');
  }
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now.getTime()) {
    return { ...cached.value, cache: { ...cached.value.cache, hit: true } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const originResponse = await fetchImpl(settings.apiUrl, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${settings.apiToken}`,
        'x-student-identifier': key },
      signal: controller.signal,
    });
    const retrievedAt = now.toISOString();
    if (originResponse.status === 404 || originResponse.status === 204) {
      const value = response('no_data', null, null, retrievedAt, false,
        settings.cacheTtlMs, 'student_not_found');
      if (settings.cacheTtlMs > 0) cache.set(key, { value, expiresAt: now.getTime() + settings.cacheTtlMs });
      return value;
    }
    if (!originResponse.ok) {
      return response('unavailable', null, null, retrievedAt, false,
        settings.cacheTtlMs, 'origin_unavailable');
    }
    const body = await originResponse.json();
    const source = body?.data && typeof body.data === 'object' ? body.data : body;
    const data = authorizedData(source);
    if (!data) {
      return response('no_data', null, validReferenceAt(body?.referenceAt), retrievedAt,
        false, settings.cacheTtlMs, 'authorized_data_absent');
    }
    const value = response('available', data, validReferenceAt(body?.referenceAt || source.referenceAt),
      retrievedAt, false, settings.cacheTtlMs);
    if (settings.cacheTtlMs > 0) cache.set(key, { value, expiresAt: now.getTime() + settings.cacheTtlMs });
    return value;
  } catch {
    return response('unavailable', null, null, now.toISOString(), false,
      settings.cacheTtlMs, 'origin_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

function clearEngagementCache() {
  cache.clear();
}

module.exports = { fetchOfficialEngagement, clearEngagementCache, authorizedData };
