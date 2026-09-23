require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fetchOfficialEngagement, clearEngagementCache, authorizedData } =
  require('../../src/services/engagement-client.service');

const settings = { apiUrl: 'https://engagement.example.test/student', apiToken: 'server-secret',
  timeoutMs: 100, cacheTtlMs: 60000 };
const now = new Date('2026-09-23T10:00:00Z');

test.beforeEach(() => clearEngagementCache());

test('fetches official data with server credentials and exposes only authorized existing fields', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ data: {
      engagementLevel: 'Alto', cohort: 'Turma 10', challengesCompleted: 8, totalChallenges: 10, score: 920,
      participation: 'high', privateEmail: 'student@example.com', missing: null,
      history: [{ type: 'challenge', title: 'API', status: 'completed', secret: 'hidden' }],
      projects: [{ name: 'VagasJL', url: 'https://example.com/project', private: true }],
    }, referenceAt: '2026-09-22T23:59:59Z', internalToken: 'hidden' }) };
  };
  const result = await fetchOfficialEngagement(' Student@Example.com ', { settings, fetchImpl, now });
  assert.equal(result.status, 'available');
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.indicator, { dimension: 'training_engagement',
    label: 'Engajamento na formacao', category: 'Alto', displayValue: 'Alto',
    categorySource: 'official', availability: 'available' });
  assert.equal(result.referenceAt, '2026-09-22T23:59:59Z');
  assert.deepEqual(result.data, { engagementLevel: 'Alto', cohort: 'Turma 10', challengesCompleted: 8,
    totalChallenges: 10, score: 920, participation: 'high',
    history: [{ type: 'challenge', title: 'API', status: 'completed' }],
    projects: [{ name: 'VagasJL', url: 'https://example.com/project' }] });
  assert.equal(request.url, settings.apiUrl);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.headers.authorization, 'Bearer server-secret');
  assert.equal(request.options.headers['x-student-identifier'], 'student@example.com');
  assert.equal(JSON.stringify(result).includes('server-secret'), false);
  assert.equal(JSON.stringify(result).includes('privateEmail'), false);
});

test('uses isolated in-memory cache without another origin request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200,
    json: async () => ({ cohort: 'Turma 1', score: 10 }) }; };
  const first = await fetchOfficialEngagement('student@example.com', { settings, fetchImpl, now });
  const second = await fetchOfficialEngagement('student@example.com', { settings,
    fetchImpl: async () => assert.fail('cache miss'), now: new Date(now.getTime() + 1000) });
  assert.equal(calls, 1);
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.deepEqual(second.data, first.data);
});

test('returns explicit no data without invented zero values', async () => {
  const result = await fetchOfficialEngagement('student@example.com', { settings, now,
    fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.deepEqual(result.data, null);
  assert.equal(result.status, 'no_data');
  assert.equal(result.reason, 'student_not_found');
  assert.deepEqual(result.indicator, { dimension: 'training_engagement',
    label: 'Engajamento na formacao', category: null, displayValue: 'Nao disponivel',
    categorySource: null, availability: 'no_data' });
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('returns unavailable on network failure, timeout or missing integration', async () => {
  const failed = await fetchOfficialEngagement('student@example.com', { settings, now,
    fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(failed.status, 'unavailable');
  assert.equal(failed.data, null);
  const timedOut = await fetchOfficialEngagement('other@example.com', {
    settings: { ...settings, timeoutMs: 5 }, now,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  assert.equal(timedOut.status, 'unavailable');
  const missing = await fetchOfficialEngagement('third@example.com', { now,
    settings: { apiUrl: '', apiToken: '', timeoutMs: 100, cacheTtlMs: 0 } });
  assert.equal(missing.reason, 'integration_not_configured');
});

test('sanitizer never fabricates absent engagement fields', () => {
  assert.deepEqual(authorizedData({ cohort: 'A' }), { cohort: 'A' });
  assert.equal(authorizedData({ challengesCompleted: '8', secret: 10 }), null);
  assert.deepEqual(authorizedData({ history: [] }), { history: [] });
});

test('does not infer an engagement category from score or participation', async () => {
  const result = await fetchOfficialEngagement('student@example.com', { settings, now,
    fetchImpl: async () => ({ ok: true, status: 200,
      json: async () => ({ score: 1000, participation: 100 }) }) });
  assert.equal(result.status, 'available');
  assert.equal(result.indicator.category, null);
  assert.equal(result.indicator.displayValue, 'Nao disponivel');
  assert.deepEqual(result.data, { score: 1000, participation: 100 });
});
