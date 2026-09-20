require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const configuration = { version: 1, geographyWeights: { country: 6, state: 4, city: 2 },
  fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight,
    options: key === 'type' ? [{ id: 'remote', label: 'Remoto', aliases: [] },
      { id: 'hybrid', label: 'Híbrido', aliases: [] }] : [],
  })) };
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };
const technical = { vacancyValues: { type: ['remote'] }, candidateValues: { type: ['remote'] },
  requirements: [{ field: 'type', id: 'remote', importance: 'required' }],
  configuration, multipliers };

test('structured location and modality persist separately from explicit normalized restrictions', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  const content = await prepareVacancyContent({ reference: 'qa-remote', title: 'QA',
    description: 'Remoto em qualquer cidade do Brasil',
    location: { country: ' Brasil ', state: ' São Paulo ', city: ' Campinas ' },
    geographicRestrictions: { country: { value: ' BRASIL ', importance: 'required' } },
    matchProfile: { values: { type: 'Remoto' }, requirements: technical.requirements } });
  const vacancy = new Vacancy({ ...content, origin: 'IMPORTED', importSource: 'board',
    importSourceId: 'qa-remote' });
  assert.equal(vacancy.validateSync(), undefined);
  assert.deepEqual(vacancy.location.toObject(), { country: 'Brasil', state: 'São Paulo', city: 'Campinas' });
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  assert.equal(vacancy.geographicRestrictions.country.value, 'brasil');
  assert.equal(vacancy.geographicRestrictions.city, undefined);
});

test('remote address alone never changes score or denominator across cities', () => {
  const elsewhere = calculateCompetencyMatch({ ...technical, vacancy: { origin: 'COMPANY',
    location: { country: 'Brasil', state: 'São Paulo', city: 'Campinas' } },
  candidateLocation: { country: 'Brasil', state: 'Rio de Janeiro', city: 'Niterói' } });
  assert.deepEqual([elsewhere.earnedPoints, elsewhere.possiblePoints, elsewhere.percentage], [8, 8, 100]);
  assert.equal(elsewhere.details.some((detail) => detail.field.startsWith('geo.')), false);
});

test('explicit country restriction is the only applicable geographic criterion', () => {
  const geographicRestrictions = { country: { value: 'brasil', importance: 'desirable' } };
  const matched = calculateCompetencyMatch({ ...technical, geographicRestrictions,
    candidateLocation: { country: ' Brasil ', state: 'Rio de Janeiro', city: 'Niterói' } });
  assert.deepEqual([matched.earnedPoints, matched.possiblePoints, matched.percentage], [11, 11, 100]);
  assert.deepEqual(matched.details.map((detail) => detail.field), ['type', 'geo.country']);
  const elsewhere = calculateCompetencyMatch({ ...technical, geographicRestrictions,
    candidateLocation: { country: 'Portugal', state: 'Lisboa', city: 'Lisboa' } });
  assert.deepEqual([elsewhere.earnedPoints, elsewhere.possiblePoints, elsewhere.percentage], [8, 11, 72.73]);
  assert.equal(elsewhere.eligibility.eligible, true);
});

test('hybrid explicit state restriction uses published weight without geographic elimination', () => {
  const score = calculateCompetencyMatch({ ...technical,
    vacancyValues: { type: ['hybrid'] }, candidateValues: { type: ['hybrid'] },
    requirements: [{ field: 'type', id: 'hybrid', importance: 'required' }],
    geographicRestrictions: { state: { value: 'sao paulo', importance: 'required' } },
    candidateLocation: { state: 'Minas Gerais' } });
  assert.deepEqual([score.earnedPoints, score.possiblePoints], [8, 12]);
  assert.equal(score.eligibility.eligible, true);
});

test('ambiguous imported location remains audit-only and cannot score or eliminate', async (context) => {
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
  const vacancy = await registerImportedVacancy({ source: 'board', sourceId: 'geo-ambiguous' }, {
    reference: 'geo-ambiguous', title: 'QA', description: 'Texto da vaga',
    location: 'São Paulo, Brasil, talvez remoto', matchProfile: { values: { type: 'Remoto' } },
  });
  assert.equal(vacancy.location, null);
  assert.equal(vacancy.geographicRestrictions, null);
  assert.equal(vacancy.importMappingAudit.rawLocation, 'São Paulo, Brasil, talvez remoto');
  assert.equal(vacancy.toJSON().importMappingAudit, undefined);
  const score = calculateCompetencyMatch({ ...technical, vacancy: { origin: 'IMPORTED' },
    candidateLocation: { country: 'Brasil', city: 'São Paulo' },
    geographicRestrictions: vacancy.geographicRestrictions });
  assert.deepEqual([score.earnedPoints, score.possiblePoints], [8, 8]);
  assert.equal(score.eligibility.eligible, true);
});

test('explicit restrictions need published weights and reject unstructured or inferred locations', async (context) => {
  const config = { ...configuration, geographyWeights: null };
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => config }));
  const base = { reference: 'qa', title: 'QA', description: 'Remoto',
    matchProfile: { values: { type: 'remote' } } };
  await assert.rejects(prepareVacancyContent({ ...base, geographicRestrictions: {
    country: { value: 'Brasil', importance: 'required' },
  } }), { statusCode: 503 });
  for (const extra of [
    { location: 'Brasil' },
    { geographicRestrictions: { country: 'Brasil' } },
    { geographicRestrictions: { city: { value: 'UNKNOWN', importance: 'required' } } },
    { geographicRestrictions: { country: { value: 'Brasil', importance: 'required',
      eliminatory: true } } },
  ]) await assert.rejects(prepareVacancyContent({ ...base, ...extra }), { statusCode: 400 });
});
