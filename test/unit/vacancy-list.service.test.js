require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const { listVacancies, parseQuery, PAGE_SIZE } = require('../../src/services/vacancy-list.service');

const candidate = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const admin = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'admin' };
const now = new Date('2026-09-28T12:00:00Z');

function setup(context, rows = [], total = rows.length) {
  const state = {};
  const chain = {
    select(value) { state.select = value; return this; },
    sort(value) { state.sort = value; return this; },
    skip(value) { state.skip = value; return this; },
    limit(value) { state.limit = value; return this; },
    async lean() { return rows; },
  };
  const find = context.mock.method(Vacancy, 'find', (filter) => {
    state.filter = filter;
    return chain;
  });
  const count = context.mock.method(Vacancy, 'countDocuments', async (filter) => {
    state.countFilter = filter;
    return total;
  });
  return { state, find, count };
}

test('candidate lists ten active unexpired vacancies without Match calculation', async (context) => {
  const { state } = setup(context, [{ _id: 'a' }], 21);
  const result = await listVacancies(candidate, { page: '2', origin: 'IMPORTED', city: 'São Paulo',
    type: 'remote', skill: 'playwright' }, now);

  assert.equal(result.limit, PAGE_SIZE);
  assert.equal(result.page, 2);
  assert.equal(result.total, 21);
  assert.equal(result.pages, 3);
  assert.equal(state.skip, 10);
  assert.equal(state.limit, 10);
  assert.deepEqual(state.sort, { updatedAt: -1, _id: -1 });
  assert.equal(state.select, '-applicationChannel -statusHistory -requirementsHistory');
  assert.equal(state.filter.status, 'active');
  assert.equal(state.filter.origin, 'IMPORTED');
  assert.equal(state.filter['matchProfile.values.type'], 'remote');
  assert.deepEqual(state.filter.$and[1].$or, [
    { 'matchProfile.requirements.id': 'playwright' },
    { 'matchProfile.values.testAutomationTechnologies': 'playwright' },
    { 'matchProfile.values.qaTools': 'playwright' },
    { 'matchProfile.values.programmingLanguages': 'playwright' },
    { 'matchProfile.values.genAITools': 'playwright' },
  ]);
  assert.match('São Paulo', state.filter['location.city']);
  assert.deepEqual(state.filter.$and[0], { $or: [
    { expiresAt: null }, { expiresAt: { $gt: now } },
  ] });
  assert.deepEqual(state.countFilter, state.filter);
});

test('admin can list every status and combine textual and structured filters', async (context) => {
  const { state } = setup(context);
  await listVacancies(admin, { q: 'automação', status: 'pending', origin: 'ADMIN',
    level: 'senior', role: 'qa_engineer', specialization: 'test_automation', country: 'Brasil' }, now);

  assert.equal(state.filter.status, 'pending');
  assert.equal(state.filter.origin, 'ADMIN');
  assert.equal(state.filter['matchProfile.values.level'], 'senior');
  assert.equal(state.filter['matchProfile.values.role'], 'qa_engineer');
  assert.equal(state.filter['matchProfile.values.specialization'], 'test_automation');
  assert.match('Brasil', state.filter['location.country']);
  assert.equal(state.filter.$or.length, 7);
  assert.equal(state.filter.$and, undefined);
  assert.equal(state.select, '-statusHistory -requirementsHistory');
});

test('rejects unsupported filters, invalid pagination and restricted candidate status', () => {
  assert.throws(() => parseQuery(candidate, { unexpected: 'x' }), { statusCode: 400 });
  assert.throws(() => parseQuery(candidate, { page: '0' }), { statusCode: 400 });
  assert.throws(() => parseQuery(candidate, { status: 'pending' }), { statusCode: 400 });
  assert.throws(() => parseQuery(admin, { origin: 'UNKNOWN' }), { statusCode: 400 });
  assert.throws(() => parseQuery({ role: 'company' }, {}), { statusCode: 403 });
});

test('escapes regex metacharacters in free-text filters', async (context) => {
  const { state } = setup(context);
  await listVacancies(admin, { q: 'QA (API)+', city: 'S.*P' }, now);
  assert.equal(state.filter.$or[0].title.source, 'QA \\(API\\)\\+');
  assert.equal(state.filter['location.city'].source, 'S\\.\\*P');
});
