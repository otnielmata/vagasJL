require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { validateRequirements } = require('../../src/services/vacancy-requirements.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { version: 1, fields: Object.keys(INITIAL_MATCH_WEIGHTS).map((key) => ({
  key, weight: INITIAL_MATCH_WEIGHTS[key], options: key === 'type'
    ? [{ id: 'remote', label: 'Remoto', aliases: [] }] : key === 'automation'
      ? [{ id: 'automation', label: 'Automacao', aliases: [] }] : [],
})) };
const provenance = { source: 'board', sourceId: 'job-1' };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };

function setup(context) {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  const create = context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  return { create };
}

test('imported false fields are omitted from canonical profile and kept only in internal audit', async (context) => {
  setup(context);
  const vacancy = await registerImportedVacancy(provenance, { reference: 'job-1', title: 'QA',
    description: 'Automacao mencionada', matchProfile: { values: {
      type: 'Remoto', automation: false,
    } } });
  assert.equal(vacancy.validateSync(), undefined);
  assert.equal(vacancy.origin, 'IMPORTED');
  assert.equal(vacancy.status, 'pending');
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.equal(vacancy.matchProfile.values.automation, undefined);
  assert.equal(vacancy.importMappingAudit.rawFalseValues[0].field, 'automation');
  assert.equal(vacancy.importMappingAudit.rawFalseValues[0].value, false);
  assert.equal(vacancy.importSource, 'board');
  assert.equal(vacancy.importSourceId, 'job-1');
  assert.equal(vacancy.toJSON().importMappingAudit, undefined);
  assert.equal(vacancy.matchProfile.requirements.length, 0);
});

test('all false imported values are non-calculable and never reward matching absence', async (context) => {
  setup(context);
  const vacancy = await registerImportedVacancy(provenance, { reference: 'job-2', title: 'QA',
    description: 'Texto sem requisito identificado', matchProfile: { values: {
      type: false, automation: false,
    } } });
  assert.equal(vacancy.validateSync(), undefined);
  assert.deepEqual(vacancy.matchProfile.values.toObject(), {});
  for (const candidateValues of [{ automation: ['automation'] }, { automation: false },
    { automation: 'UNKNOWN' }, { automation: null }, {}]) {
    const score = calculateCompetencyMatch({ vacancyValues: {}, candidateValues,
      configuration, requirements: [], multipliers, vacancy: { origin: 'IMPORTED' } });
    assert.equal(score.possiblePoints, 0);
    assert.equal(score.earnedPoints, 0);
    assert.equal(score.percentage, null);
    assert.equal(score.technicalCompatibility, 'not_calculable');
    assert.equal(score.eligibility.eligible, true);
  }
  assert.throws(() => validateRequirements([{
    field: 'automation', id: 'automation', importance: 'required', eliminatory: true,
  }], vacancy.matchProfile.values, configuration), { statusCode: 400 });
});

test('identified imported requirement scores normally without counting false field', async (context) => {
  setup(context);
  const vacancy = await registerImportedVacancy(provenance, { reference: 'job-3', title: 'QA',
    description: 'Perfil misto', matchProfile: { values: { type: false, automation: 'Automacao' } } });
  assert.equal(vacancy.matchProfile.values.type, undefined);
  const requirements = [{ field: 'automation', id: 'automation', importance: 'required' }];
  const score = calculateCompetencyMatch({ vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { automation: ['automation'], type: false }, configuration, requirements,
    multipliers,
    vacancy: { origin: 'IMPORTED' } });
  assert.equal(score.possiblePoints, INITIAL_MATCH_WEIGHTS.automation);
  assert.equal(score.percentage, 100);
  assert.equal(score.technicalCompatibility, 'calculable');
  assert.equal(score.details.length, 1);
});

test('false is not silently accepted for company or admin content and unknown false key is rejected', async (context) => {
  const { create } = setup(context);
  const input = { reference: 'job-4', title: 'QA', description: 'Teste',
    matchProfile: { values: { type: false } } };
  await assert.rejects(prepareVacancyContent(input), { statusCode: 400 });
  const unchanged = calculateCompetencyMatch({ vacancyValues: {}, candidateValues: {},
    configuration, requirements: [], multipliers, vacancy: { origin: 'COMPANY' } });
  assert.equal(unchanged.percentage, null);
  assert.equal(unchanged.calculationStatus, 'not_calculable');
  assert.equal(unchanged.technicalCompatibility, undefined);
  await assert.rejects(registerImportedVacancy(provenance, { ...input,
    matchProfile: { values: { type: 'Remoto', madeUpSkill: false } },
  }), { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
});
