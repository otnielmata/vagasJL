require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Company = require('../../src/models/company.model');
const CompanyUser = require('../../src/models/company-user.model');
const User = require('../../src/models/user.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { validateRequirements, updateRequirements } = require('../../src/services/vacancy-requirements.service');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const companyId = '6512f1e2b3a1c2d3e4f5a6b8';
const actorId = '6512f1e2b3a1c2d3e4f5a6b9';
const configuration = { version: 1, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] }]
    : key === 'testAutomationTechnologies'
      ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress.io'] }] : [],
})) };
const values = { type: ['remote'], testAutomationTechnologies: ['cypress'], yearsOfExperience: 2.5 };
const requirements = [
  { field: 'type', id: 'remote', importance: 'required' },
  { field: 'testAutomationTechnologies', id: 'cypress', importance: 'desirable' },
  { field: 'yearsOfExperience', value: 2.5, importance: 'indifferent' },
];

function setup(context, overrides = {}) {
  const vacancy = { _id: vacancyId, origin: 'COMPANY', company: companyId,
    status: 'pending', updatedAt: new Date('2026-09-17T00:00:00Z'),
    requirementsRevision: 0, deletedAt: null,
    matchProfile: { configurationVersion: 1, values, requirements: [] }, ...overrides };
  const vacancyQuery = { select: async () => vacancy };
  context.mock.method(Vacancy, 'findById', () => vacancyQuery);
  const update = context.mock.method(Vacancy, 'findOneAndUpdate', async (_filter, operation) => ({
    ...vacancy, matchProfile: { ...vacancy.matchProfile,
      requirements: operation.$set['matchProfile.requirements'] },
    requirementsRevision: operation.$set.requirementsRevision,
  }));
  context.mock.method(Configuration, 'findOne', () => ({
    sort: async () => configuration, then(resolve) { return Promise.resolve(configuration).then(resolve); },
  }));
  const companyQuery = { select: async () => ({ _id: companyId }) };
  context.mock.method(Company, 'findOne', () => companyQuery);
  const membershipQuery = { select: async () => ({ _id: 'membership' }) };
  context.mock.method(CompanyUser, 'findOne', () => membershipQuery);
  const userQuery = { select: async () => ({ _id: actorId }) };
  context.mock.method(User, 'findOne', () => userQuery);
  return { vacancy, update, companyQuery, membershipQuery };
}

test('authorized recruiter persists canonical classifications with revision and audit', async (context) => {
  const { update } = setup(context);
  const result = await updateRequirements({ id: actorId, role: 'company' }, vacancyId,
    { requirements, reason: 'Revisao do recrutador' });
  assert.deepEqual(result.matchProfile.requirements, requirements);
  assert.equal(result.requirementsRevision, 1);
  assert.deepEqual(update.mock.calls[0].arguments[1].$push.requirementsHistory.requirements, requirements);
  assert.equal(update.mock.calls[0].arguments[1].$push.requirementsHistory.actor, actorId);
  assert.equal(Object.hasOwn(update.mock.calls[0].arguments[1].$set, 'origin'), false);
});

test('unknown importance, uncatalogued ID and duplicate competence reject without partial write', async (context) => {
  const { update } = setup(context);
  for (const input of [[{ ...requirements[0], importance: 'important' }],
    [{ ...requirements[0], id: 'unknown' }], [requirements[0], requirements[0]]]) {
    await assert.rejects(updateRequirements({ id: actorId, role: 'admin' }, vacancyId,
      { requirements: input, reason: 'Teste' }), { statusCode: input.length === 2 ? 409 : 400 });
  }
  assert.equal(update.mock.callCount(), 0);
});

test('unauthorized company or forged body cannot change requirements', async (context) => {
  const { vacancy, update, membershipQuery } = setup(context);
  membershipQuery.select = async () => null;
  await assert.rejects(updateRequirements({ id: actorId, role: 'company' }, vacancyId,
    { requirements, reason: 'Teste' }), { statusCode: 403 });
  vacancy.origin = 'IMPORTED';
  await assert.rejects(updateRequirements({ id: actorId, role: 'company' }, vacancyId,
    { requirements, reason: 'Teste' }), { statusCode: 403 });
  await assert.rejects(updateRequirements({ id: actorId, role: 'admin' }, vacancyId,
    { requirements, reason: 'Teste', origin: 'COMPANY' }), { statusCode: 400 });
  assert.equal(update.mock.callCount(), 0);
});

test('concurrent requirement update returns conflict', async (context) => {
  const { update } = setup(context);
  update.mock.mockImplementation(async () => null);
  await assert.rejects(updateRequirements({ id: actorId, role: 'admin' }, vacancyId,
    { requirements, reason: 'Teste' }), { statusCode: 409 });
});

test('creation accepts same structured requirements and import without evidence stays unclassified', async (context) => {
  setup(context);
  const input = { reference: 'qa-1', title: 'QA', description: 'Cypress',
    matchProfile: { values: { type: 'Remoto', testAutomationTechnologies: 'Cypress.io' },
      requirements: requirements.slice(0, 2) } };
  const content = await prepareVacancyContent(input);
  assert.deepEqual(content.matchProfile.requirements, requirements.slice(0, 2));
  assert.equal(validateRequirements([], content.matchProfile.values, configuration).length, 0);
  await assert.rejects(registerImportedVacancy({ source: 'board', sourceId: '1' }, input),
    { statusCode: 400 });
});

test('configured desirable factor reduces both contribution and denominator; indifferent adds nothing', () => {
  const result = calculateCompetencyMatch({ vacancyValues: values,
    candidateValues: { type: ['remote'] }, configuration, requirements, desirableFactor: 0.25 });
  assert.equal(result.earnedPoints, 8);
  assert.equal(result.possiblePoints, 10.5);
  assert.equal(result.percentage, 76.19);
  assert.equal(result.details.length, 2);
  const matched = calculateCompetencyMatch({ vacancyValues: values,
    candidateValues: { type: ['remote'], testAutomationTechnologies: ['cypress'] },
    configuration, requirements, desirableFactor: 0.25 });
  assert.equal(matched.percentage, 100);
});

test('free text and derived fields never create requirements or points', () => {
  const score = calculateCompetencyMatch({ vacancyValues: { type: ['remote'] },
    candidateValues: { type: ['remote'], hasGenAI: true }, configuration,
    requirements: [], desirableFactor: 0.5 });
  assert.equal(score.possiblePoints, 0);
  assert.equal(score.earnedPoints, 0);
});

test('mongoose persists requirement structure and validates it for activation', () => {
  const vacancy = new Vacancy({ origin: 'COMPANY', company: companyId, createdBy: actorId,
    title: 'QA', description: 'Testes', matchProfile: { configurationVersion: 1,
      values, requirements } });
  assert.equal(vacancy.validateSync(), undefined);
  assert.deepEqual(validateRequirements(vacancy.matchProfile.requirements,
    vacancy.matchProfile.values, configuration, true), requirements);
  assert.equal(vacancy.toJSON().requirementsHistory, undefined);
  assert.equal(vacancy.toJSON().matchProfile.requirements.length, 3);
});

test('incomplete classification cannot activate a vacancy', () => {
  assert.throws(() => validateRequirements(requirements.slice(0, 1), values,
    configuration, true), { statusCode: 409 });
  assert.throws(() => validateRequirements([], values, configuration, true), { statusCode: 409 });
});
