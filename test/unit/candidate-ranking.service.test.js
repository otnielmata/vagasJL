require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchMultipliersConfiguration = require('../../src/models/match-multipliers-configuration.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const RankingThresholdConfiguration = require('../../src/models/ranking-threshold-configuration.model');
const User = require('../../src/models/user.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { rankCandidates } = require('../../src/services/candidate-ranking.service');
const { rankVacancies } = require('../../src/services/vacancy-ranking.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const companyId = '6512f1e2b3a1c2d3e4f5a6b8';
const recruiterId = '6512f1e2b3a1c2d3e4f5a6b9';
const candidateId = '6512f1e2b3a1c2d3e4f5a6ba';
const now = new Date('2026-09-18T12:00:00Z');
const configuration = { version: 1, geographyWeights: { country: 6, state: 4, city: 2 },
  fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: key === 'agile' ? 8 : INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] },
      { id: 'hybrid', label: 'Hibrido', aliases: [] }] : key === 'agile'
      ? [{ id: 'scrum', label: 'Scrum', aliases: [] }] : [],
})) };

function vacancy(overrides = {}) {
  const result = { _id: vacancyId, origin: 'COMPANY', status: 'active', company: companyId,
    createdBy: recruiterId, importSource: null, importSourceId: null, deletedAt: null,
    expiresAt: null, matchProfile: { configurationVersion: 1,
      values: { type: ['remote'], agile: ['scrum'] }, requirements: [
        { field: 'type', id: 'remote', importance: 'required' },
        { field: 'agile', id: 'scrum', importance: 'required' },
      ] }, ...overrides };
  result.toJSON = () => ({ _id: result._id, origin: result.origin,
    matchProfile: result.matchProfile });
  return result;
}

function setup(context, currentVacancy = vacancy()) {
  context.mock.method(MatchEvaluation, 'init', async () => MatchEvaluation);
  context.mock.method(MatchEvaluation, 'findOneAndUpdate', async (_filter, update) => ({
    _id: `audit-${update.$setOnInsert.candidate}`,
  }));
  const matchConfiguration = { version: 1,
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 } };
  context.mock.method(MatchMultipliersConfiguration, 'findOne', () => ({
    sort: async () => matchConfiguration,
  }));
  const thresholdState = { current: null };
  context.mock.method(RankingThresholdConfiguration, 'findOne', () => ({
    sort: async () => thresholdState.current,
  }));
  const vacancyLookup = { select: async () => currentVacancy };
  context.mock.method(Vacancy, 'findById', () => vacancyLookup);
  const companyLookup = { select: async () => ({ _id: companyId }) };
  context.mock.method(Company, 'findOne', () => companyLookup);
  context.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: recruiterId }) }));
  context.mock.method(CompanyUser, 'findOne', () => ({ select: async () => ({ _id: 'membership' }) }));
  context.mock.method(Configuration, 'findOne', async () => configuration);
  const candidates = [
    { _id: candidateId, name: 'Ana', email: 'private@example.com', phone: '123' },
    { _id: '6512f1e2b3a1c2d3e4f5a6bb', name: 'Bia' },
  ];
  const candidateQuery = { select: async () => candidates };
  const findCandidates = context.mock.method(Candidate, 'find', () => candidateQuery);
  const profiles = [
    { candidate: candidateId, configurationVersion: 1, revision: 1, updatedAt: now,
      values: { type: ['remote'] } },
    { candidate: '6512f1e2b3a1c2d3e4f5a6bb', configurationVersion: 1,
      revision: 1, updatedAt: now, values: { type: ['remote', 'hybrid'], agile: ['scrum'] } },
  ];
  const profileQuery = { select: async () => profiles };
  context.mock.method(CandidateMatchProfile, 'find', () => profileQuery);
  return { candidates, candidateQuery, profiles, profileQuery, companyLookup, findCandidates,
    matchConfiguration, thresholdState };
}

test('company ranking scores from vacancy requirements, sorts and hides private candidate fields', async (context) => {
  const { findCandidates } = setup(context);
  const result = await rankCandidates({ id: recruiterId, role: 'company' }, vacancyId,
    { page: '1', limit: '1' }, now);
  assert.equal(result.total, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.minimumMatchPercentage, null);
  assert.equal(result.rankingThresholdVersion, null);
  assert.equal(result.items[0].candidate.name, 'Bia');
  assert.equal(result.items[0].percentage, 100);
  assert.deepEqual([result.items[0].earnedPoints, result.items[0].possiblePoints,
    result.items[0].configurationVersion], [16, 16, 1]);
  assert.equal(result.items[0].matchedRequiredCount, 2);
  assert.equal(result.items[0].multipliersVersion, 1);
  assert.equal(result.items[0].candidate.email, undefined);
  assert.equal(findCandidates.mock.calls[0].arguments[0].status, 'active');
  const second = await rankCandidates({ id: recruiterId, role: 'company' }, vacancyId,
    { page: '2', limit: '1' }, now);
  assert.equal(second.items[0].candidate.name, 'Ana');
  assert.equal(second.items[0].percentage, 50);
});

test('company ranking accepts Top 3, Top 5 and Top 10 through the existing limit', async (context) => {
  const { candidates, profiles } = setup(context);
  candidates.splice(0, candidates.length);
  profiles.splice(0, profiles.length);
  for (let index = 0; index < 10; index += 1) {
    const id = `6512f1e2b3a1c2d3e4f5a${String(index).padStart(2, '0')}`;
    candidates.push({ _id: id, name: `Candidate ${index}` });
    profiles.push({ candidate: id, updatedAt: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`),
      configurationVersion: 1, values: { type: ['remote'], agile: ['scrum'] } });
  }
  for (const limit of [3, 5, 10]) {
    const result = await rankCandidates({ role: 'admin' }, vacancyId, { limit: String(limit) }, now);
    assert.equal(result.items.length, limit);
    assert.equal(result.total, 10);
    assert.equal(result.limit, limit);
  }
});

test('company ranking applies published cutoff before total and pagination', async (context) => {
  const { thresholdState } = setup(context);
  thresholdState.current = { version: 4, minimumPercentage: 60 };
  const result = await rankCandidates({ role: 'admin' }, vacancyId, { limit: '1' }, now);
  assert.equal(result.total, 1);
  assert.equal(result.pages, 1);
  assert.equal(result.items[0].candidate.name, 'Bia');
  assert.equal(result.minimumMatchPercentage, 60);
  assert.equal(result.rankingThresholdVersion, 4);
});

test('both ranking directions use identical score and vacancy denominator for same pair', async (context) => {
  const row = vacancy();
  const { candidates, profiles } = setup(context, row);
  candidates.splice(1);
  profiles.splice(1);
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({ _id: candidateId }) }));
  context.mock.method(CandidateMatchProfile, 'findOne', () => ({ select: async () => profiles[0] }));
  context.mock.method(Vacancy, 'find', () => ({ select: async () => [row] }));
  context.mock.method(Company, 'find', () => ({ select: async () => [{ _id: companyId }] }));
  context.mock.method(Configuration, 'find', async () => [configuration]);
  const fromCandidate = await rankVacancies({ id: candidateId, role: 'candidate' }, {}, now);
  const fromCompany = await rankCandidates({ id: recruiterId, role: 'company' }, vacancyId, {}, now);
  assert.equal(fromCandidate.items[0].percentage, 50);
  assert.equal(fromCandidate.items[0].percentage, fromCompany.items[0].percentage);
});

test('company ranking considers only explicitly restricted country, not vacancy address', async (context) => {
  const row = vacancy({ location: { country: 'Brasil', city: 'Campinas', state: 'São Paulo' },
    geographicRestrictions: { country: { value: 'brasil', importance: 'required' } } });
  const { candidates, profiles } = setup(context, row);
  candidates[0].country = 'Brasil';
  candidates[0].city = 'Niterói';
  candidates[1].country = 'Portugal';
  const result = await rankCandidates({ role: 'admin' }, vacancyId, {}, now);
  assert.deepEqual(result.items.map((item) => [item.candidate.name, item.earnedPoints,
    item.possiblePoints]), [['Bia', 16, 22], ['Ana', 14, 22]]);
  profiles[1].values = { type: ['remote'] };
  const next = await rankCandidates({ role: 'admin' }, vacancyId, {}, now);
  assert.equal(next.items[0].candidate.name, 'Ana');
});

test('recalibrating published desirable multiplier affects both ranking directions equally', async (context) => {
  const row = vacancy();
  row.matchProfile.requirements[1].importance = 'desirable';
  const { candidates, profiles, matchConfiguration } = setup(context, row);
  candidates.splice(1);
  profiles.splice(1);
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({ _id: candidateId }) }));
  context.mock.method(CandidateMatchProfile, 'findOne', () => ({ select: async () => profiles[0] }));
  context.mock.method(Vacancy, 'find', () => ({ select: async () => [row] }));
  context.mock.method(Company, 'find', () => ({ select: async () => [{ _id: companyId }] }));
  context.mock.method(Configuration, 'find', async () => [configuration]);
  const beforeCandidate = await rankVacancies({ id: candidateId, role: 'candidate' }, {}, now);
  const beforeCompany = await rankCandidates({ id: recruiterId, role: 'company' }, vacancyId, {}, now);
  assert.equal(beforeCandidate.items[0].percentage, 66.67);
  assert.equal(beforeCompany.items[0].percentage, 66.67);
  assert.equal(beforeCandidate.items[0].multipliersVersion, 1);
  matchConfiguration.version = 2;
  matchConfiguration.multipliers.desirable = 0.4;
  const afterCandidate = await rankVacancies({ id: candidateId, role: 'candidate' }, {}, now);
  const afterCompany = await rankCandidates({ id: recruiterId, role: 'company' }, vacancyId, {}, now);
  assert.equal(afterCandidate.items[0].percentage, 71.43);
  assert.equal(afterCompany.items[0].percentage, 71.43);
  assert.equal(afterCandidate.items[0].multipliersVersion, 2);
  assert.equal(afterCompany.items[0].multipliersVersion, 2);
  assert.equal(beforeCandidate.items[0].percentage, 66.67);
});

test('unpublished multipliers block candidate ranking before candidate data is read', async (context) => {
  const { findCandidates } = setup(context);
  context.mock.method(MatchMultipliersConfiguration, 'findOne', () => ({ sort: async () => null }));
  await assert.rejects(rankCandidates({ role: 'admin' }, vacancyId, {}, now), { statusCode: 503 });
  assert.equal(findCandidates.mock.callCount(), 0);
});

test('inactive candidates and missing profiles are omitted from total', async (context) => {
  const { candidateQuery, profiles, findCandidates } = setup(context);
  candidateQuery.select = async () => [{ _id: candidateId, name: 'Ana' }];
  profiles.splice(0);
  const result = await rankCandidates({ role: 'admin' }, vacancyId, {}, now);
  assert.equal(result.total, 0);
  assert.equal(findCandidates.mock.calls[0].arguments[0].status, 'active');
});

test('eliminatory mismatch is excluded while low non-eliminatory score remains', async (context) => {
  const row = vacancy();
  const { profiles } = setup(context, row);
  row.matchProfile.requirements[1].eliminatory = true;
  const result = await rankCandidates({ role: 'admin' }, vacancyId, {}, now);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].candidate.name, 'Bia');
  profiles[1].values = { type: ['remote'] };
  assert.equal((await rankCandidates({ role: 'admin' }, vacancyId, {}, now)).total, 0);
});

test('company access is denied for other origins or inactive ownership before candidate fetch', async (context) => {
  const row = vacancy({ origin: 'ADMIN', company: null, importSource: null });
  const { companyLookup, findCandidates } = setup(context, row);
  await assert.rejects(rankCandidates({ id: recruiterId, role: 'company' }, vacancyId),
    { statusCode: 403 });
  row.origin = 'COMPANY';
  row.company = companyId;
  companyLookup.select = async () => null;
  await assert.rejects(rankCandidates({ id: recruiterId, role: 'company' }, vacancyId),
    { statusCode: 403 });
  assert.equal(findCandidates.mock.callCount(), 0);
});

test('inactive or expired vacancy and non-calculable requirements do not return ranking', async (context) => {
  const row = vacancy({ status: 'paused' });
  const { findCandidates } = setup(context, row);
  await assert.rejects(rankCandidates({ role: 'admin' }, vacancyId, {}, now), { statusCode: 404 });
  row.status = 'active';
  row.expiresAt = new Date('2026-09-18T11:00:00Z');
  await assert.rejects(rankCandidates({ role: 'admin' }, vacancyId, {}, now), { statusCode: 404 });
  row.expiresAt = null;
  row.matchProfile.requirements = [];
  await assert.rejects(rankCandidates({ role: 'admin' }, vacancyId, {}, now), { statusCode: 404 });
  assert.equal(findCandidates.mock.callCount(), 0);
});

test('invalid input and forbidden role are rejected before database access', async (context) => {
  const { findCandidates } = setup(context);
  await assert.rejects(rankCandidates({ role: 'candidate' }, vacancyId), { statusCode: 403 });
  await assert.rejects(rankCandidates({ role: 'admin' }, 'not-an-id'), { statusCode: 400 });
  await assert.rejects(rankCandidates({ role: 'admin' }, vacancyId, { limit: '51' }),
    { statusCode: 400 });
  assert.equal(findCandidates.mock.callCount(), 0);
});
