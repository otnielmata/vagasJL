require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const Company = require('../../src/models/company.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchMultipliersConfiguration = require('../../src/models/match-multipliers-configuration.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const RankingThresholdConfiguration = require('../../src/models/ranking-threshold-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { rankVacancies } = require('../../src/services/vacancy-ranking.service');

const actor = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const companyId = '6512f1e2b3a1c2d3e4f5a6b8';
const createdBy = '6512f1e2b3a1c2d3e4f5a6b9';
const now = new Date('2026-09-17T12:00:00Z');

function vacancy(id, origin, status = 'active', overrides = {}) {
  const base = { _id: id, origin, status, company: origin === 'COMPANY' ? companyId : null,
    createdBy: origin === 'IMPORTED' ? null : createdBy,
    importSource: origin === 'IMPORTED' ? 'board' : null,
    importSourceId: origin === 'IMPORTED' ? id : null,
    matchProfile: { configurationVersion: 1, values: { type: ['remote'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' }] },
    expiresAt: null, deletedAt: null, createdAt: new Date('2026-09-16T00:00:00Z'),
    ...overrides };
  base.toJSON = () => ({ ...base, toJSON: undefined, createdBy: undefined });
  return base;
}

function setup(context, vacancies) {
  context.mock.method(MatchEvaluation, 'init', async () => MatchEvaluation);
  context.mock.method(MatchEvaluation, 'findOneAndUpdate', async (_filter, update) => ({
    _id: `audit-${update.$setOnInsert.vacancy}`,
  }));
  context.mock.method(MatchMultipliersConfiguration, 'findOne', () => ({ sort: async () => ({
    version: 1, multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
  }) }));
  const thresholdState = { current: null };
  context.mock.method(RankingThresholdConfiguration, 'findOne', () => ({
    sort: async () => thresholdState.current,
  }));
  const candidateQuery = { select: async () => ({ _id: actor.id }) };
  context.mock.method(Candidate, 'findOne', () => candidateQuery);
  const profileQuery = { select: async () => ({ values: { type: ['remote'] },
    configurationVersion: 1, revision: 1, updatedAt: now }) };
  context.mock.method(CandidateMatchProfile, 'findOne', () => profileQuery);
  const vacancyQuery = { select: async () => vacancies };
  const findVacancies = context.mock.method(Vacancy, 'find', () => vacancyQuery);
  const companyQuery = { select: async () => [{ _id: companyId }] };
  const findCompanies = context.mock.method(Company, 'find', () => companyQuery);
  const configuration = { version: 1, geographyWeights: { country: 6, state: 4, city: 2 },
    fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
    key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
      ? [{ id: 'remote', label: 'Remoto', aliases: [] },
        { id: 'hybrid', label: 'Hibrido', aliases: [] }] : [],
  })) };
  const findConfigurations = context.mock.method(Configuration, 'find', async () => [configuration]);
  return { findVacancies, findCompanies, findConfigurations, candidateQuery, profileQuery,
    companyQuery, thresholdState };
}

test('filters active unexpired vacancies before scoring and paginates only eligible rows', async (context) => {
  const rows = [vacancy('a', 'COMPANY'), vacancy('b', 'IMPORTED'), vacancy('c', 'ADMIN'),
    ...['pending', 'paused', 'expired', 'removed', 'rejected'].map((status) =>
      vacancy(status, 'ADMIN', status)),
    vacancy('old', 'ADMIN', 'active', { expiresAt: new Date('2026-09-17T11:00:00Z') })];
  const { findVacancies } = setup(context, rows);
  const result = await rankVacancies(actor, { page: '2', limit: '2' }, now);
  assert.equal(result.total, 3);
  assert.equal(result.pages, 2);
  assert.equal(result.minimumMatchPercentage, null);
  assert.equal(result.rankingThresholdVersion, null);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items.map((item) => item.vacancy._id), ['c']);
  assert.equal(findVacancies.mock.calls[0].arguments[0].status, 'active');
  assert.deepEqual(findVacancies.mock.calls[0].arguments[0].$or,
    [{ expiresAt: null }, { expiresAt: { $gt: now } }]);
});

test('equivalent technical requirements score identically across all three origins', async (context) => {
  setup(context, [vacancy('a', 'COMPANY'), vacancy('b', 'IMPORTED'), vacancy('c', 'ADMIN')]);
  const result = await rankVacancies(actor, {}, now);
  assert.deepEqual(result.items.map((item) => item.percentage), [100, 100, 100]);
  assert.deepEqual(result.items.map((item) => [item.earnedPoints, item.possiblePoints,
    item.configurationVersion]), [[8, 8, 1], [8, 8, 1], [8, 8, 1]]);
  assert.deepEqual(result.items.map((item) => item.multipliersVersion), [1, 1, 1]);
  assert.deepEqual(result.items.map((item) => item.matchedRequiredCount), [1, 1, 1]);
});

test('candidate ranking accepts Top 3, Top 5 and Top 10 and keeps total before limiting', async (context) => {
  const rows = Array.from({ length: 10 }, (_, index) => vacancy(String(index), 'ADMIN'));
  setup(context, rows);
  for (const limit of [3, 5, 10]) {
    const result = await rankVacancies(actor, { limit: String(limit) }, now);
    assert.equal(result.items.length, limit);
    assert.equal(result.total, 10);
    assert.equal(result.limit, limit);
  }
});

test('candidate ranking applies published cutoff before total and pagination', async (context) => {
  const matching = vacancy('a', 'ADMIN');
  const below = vacancy('b', 'ADMIN', 'active', { matchProfile: { configurationVersion: 1,
    values: { type: ['hybrid'] },
    requirements: [{ field: 'type', id: 'hybrid', importance: 'required' }] } });
  const { thresholdState } = setup(context, [below, matching]);
  thresholdState.current = { version: 2, minimumPercentage: 60 };
  const result = await rankVacancies(actor, { limit: '1' }, now);
  assert.equal(result.total, 1);
  assert.equal(result.pages, 1);
  assert.equal(result.items[0].vacancy._id, 'a');
  assert.equal(result.minimumMatchPercentage, 60);
  assert.equal(result.rankingThresholdVersion, 2);
});

test('candidate ranking counts explicit country but not remote job address alone', async (context) => {
  const restricted = vacancy('a', 'ADMIN', 'active', {
    geographicRestrictions: { country: { value: 'brasil', importance: 'required' } },
    location: { city: 'Campinas', state: 'São Paulo', country: 'Brasil' },
  });
  const unrestricted = vacancy('b', 'ADMIN', 'active', {
    location: { city: 'Campinas', state: 'São Paulo', country: 'Brasil' },
  });
  const { candidateQuery } = setup(context, [restricted, unrestricted]);
  candidateQuery.select = async () => ({ _id: actor.id, country: 'Portugal', city: 'Lisboa' });
  const result = await rankVacancies(actor, {}, now);
  assert.deepEqual(result.items.map((item) => [item.vacancy._id, item.earnedPoints,
    item.possiblePoints]), [['b', 8, 8], ['a', 8, 14]]);
});

test('company vacancy disappears when owner is inactive or blocked', async (context) => {
  const { companyQuery } = setup(context, [vacancy('a', 'COMPANY'), vacancy('b', 'ADMIN')]);
  companyQuery.select = async () => [];
  const result = await rankVacancies(actor, {}, now);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].vacancy._id, 'b');
});

test('next request reflects pause and deadline without cache', async (context) => {
  const listed = vacancy('a', 'ADMIN');
  setup(context, [listed]);
  assert.equal((await rankVacancies(actor, {}, now)).total, 1);
  listed.status = 'paused';
  assert.equal((await rankVacancies(actor, {}, now)).total, 0);
  listed.status = 'active';
  listed.expiresAt = new Date('2026-09-17T11:00:00Z');
  assert.equal((await rankVacancies(actor, {}, now)).total, 0);
});

test('wrong role and malformed pagination are rejected before querying', async (context) => {
  const { findVacancies } = setup(context, []);
  await assert.rejects(rankVacancies({ ...actor, role: 'company' }, {}, now), { statusCode: 403 });
  for (const query of [{ page: '0' }, { page: '1.5' }, { limit: '51' }, { sort: 'origin' }]) {
    await assert.rejects(rankVacancies(actor, query, now), { statusCode: 400 });
  }
  assert.equal(findVacancies.mock.callCount(), 0);
});

test('candidate must have current profile before ranking', async (context) => {
  const { profileQuery, findVacancies } = setup(context, []);
  profileQuery.select = async () => null;
  await assert.rejects(rankVacancies(actor, {}, now), { statusCode: 409 });
  assert.equal(findVacancies.mock.callCount(), 0);
});

test('active legacy vacancy without classified requirements never enters ranking', async (context) => {
  setup(context, [vacancy('legacy', 'IMPORTED', 'active', {
    matchProfile: { configurationVersion: 1, values: { type: ['remote'] }, requirements: [] },
  })]);
  const result = await rankVacancies(actor, {}, now);
  assert.equal(result.total, 0);
});

test('eliminatory changes immediately remove unmatched vacancies of every origin from total and pages', async (context) => {
  const rows = [vacancy('company', 'COMPANY'), vacancy('imported', 'IMPORTED'),
    vacancy('admin', 'ADMIN')];
  const { profileQuery } = setup(context, rows);
  profileQuery.select = async () => ({ values: { type: [] }, configurationVersion: 1 });
  const before = await rankVacancies(actor, { page: '1', limit: '2' }, now);
  assert.equal(before.total, 3);
  assert.equal(before.pages, 2);
  assert.deepEqual(before.items.map((item) => item.percentage), [0, 0]);
  rows.forEach((row) => { row.matchProfile.requirements[0].eliminatory = true; });
  const after = await rankVacancies(actor, { page: '1', limit: '2' }, now);
  assert.equal(after.total, 0);
  assert.equal(after.pages, 0);
  rows[0].matchProfile.requirements[0].eliminatory = false;
  const restored = await rankVacancies(actor, { page: '1', limit: '2' }, now);
  assert.equal(restored.total, 1);
  assert.equal(restored.items[0].vacancy._id, 'company');
});
