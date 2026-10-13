require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchEngineConfiguration = require('../../src/models/match-engine-configuration.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const MatchMultipliersConfiguration = require('../../src/models/match-multipliers-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { getCompanyCandidateReport, technicalProfile, assertIdentifiers } =
  require('../../src/services/company-candidate-report.service');

const vacancyId = '6512f1e2b3a1c2d3e4f5a6b7';
const candidateId = '6512f1e2b3a1c2d3e4f5a6b8';
const recruiterId = '6512f1e2b3a1c2d3e4f5a6b9';
const now = new Date('2026-10-13T12:00:00Z');

const configuration = { version: 1, geographyWeights: { country: 6, state: 4, city: 2 },
  fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({ key,
    label: key === 'type' ? 'Modalidade' : key === 'agile' ? 'Agile' : key,
    weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
      ? [{ id: 'remote', label: 'Remoto', aliases: [] }]
      : key === 'agile' ? [{ id: 'agile', label: 'Agile', aliases: [] }] : [] })) };

function setup(context) {
  const vacancy = { _id: vacancyId, title: 'QA Lead', reference: 'QA-1', origin: 'ADMIN',
    createdBy: recruiterId, status: 'active', deletedAt: null, expiresAt: null,
    requirementsRevision: 1, updatedAt: now,
    matchProfile: { configurationVersion: 1, values: { type: ['remote'], agile: ['agile'] },
      requirements: [{ field: 'type', id: 'remote', importance: 'required' },
        { field: 'agile', id: 'agile', importance: 'desirable' }] } };
  context.mock.method(Vacancy, 'findById', () => ({ select: async () => vacancy }));
  const candidate = { _id: candidateId, name: 'Julio', email: 'julio@example.com',
    phone: '11999999999', city: 'Sao Paulo', state: 'SP', country: 'Brasil',
    professionalSummary: 'QA experiente', availableForOpportunities: true,
    enterpriseDisplayPermissions: { contact: ['email'], formation: [] } };
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => candidate }));
  const profile = { candidate: candidateId, configurationVersion: 1, revision: 2, updatedAt: now,
    values: { type: ['remote'], agile: ['agile'] } };
  context.mock.method(CandidateMatchProfile, 'findOne', () => ({ select: async () => profile }));
  context.mock.method(Configuration, 'findOne', async () => configuration);
  context.mock.method(MatchEngineConfiguration, 'findOne', () => ({ sort: async () => null }));
  context.mock.method(MatchMultipliersConfiguration, 'findOne', () => ({ sort: async () => ({
    version: 1, multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
  }) }));
  context.mock.method(MatchEvaluation, 'init', async () => MatchEvaluation);
  context.mock.method(MatchEvaluation, 'findOneAndUpdate', async () => ({ _id: 'audit-id' }));
  return { candidate };
}

test('recruiter report returns authorized candidate data, technical profile and Match explanation',
  async (context) => {
    setup(context);
    const result = await getCompanyCandidateReport(
      { id: recruiterId, role: 'admin' }, vacancyId, candidateId, now,
    );
    assert.equal(result.vacancy.title, 'QA Lead');
    assert.equal(result.candidate.name, 'Julio');
    assert.equal(result.candidate.email, 'julio@example.com');
    assert.equal(result.candidate.phone, undefined);
    assert.equal(result.match.percentage, 100);
    assert.equal(result.match.metCriteria.length, 2);
    assert.equal(result.profile.fields.find((field) => field.field === 'type').options[0].label, 'Remoto');
    assert.equal(result.match.audit.algorithmVersion, 'MATCH_V1');
  });

test('report rejects invalid identifiers before database access', async () => {
  assert.throws(() => assertIdentifiers('invalid', candidateId), { statusCode: 400 });
  assert.throws(() => assertIdentifiers(vacancyId, 'invalid'), { statusCode: 400 });
});

test('technical profile keeps canonical labels and experience value', () => {
  const fields = technicalProfile({ type: ['remote'], yearsOfExperience: 5 }, configuration);
  assert.deepEqual(fields[0], { field: 'type', label: 'Modalidade', value: null,
    options: [{ id: 'remote', label: 'Remoto' }] });
  assert.equal(fields[1].value, 5);
});
