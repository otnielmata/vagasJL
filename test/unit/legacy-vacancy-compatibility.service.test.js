require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-profile-configuration.model');
const Vacancy = require('../../src/models/vacancy.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { transformValues, transformLegacyVacancyInput, LEGACY_VACANCY_TRANSFORMER_VERSION } =
  require('../../src/services/legacy-vacancy-compatibility.service');
const { prepareImportedVacancyData } = require('../../src/services/vacancy-origin.service');

function configuration() {
  return { version: 7, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
    key, weight, options: key === 'type'
      ? [{ id: 'remote', label: 'Remoto', aliases: ['remote'] }]
      : key === 'testAutomationTechnologies'
        ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress.io', 'Cypress Framework'] }]
        : key === 'qaTools'
          ? [
            { id: 'qtest', label: 'qTest', aliases: ['Tricentis qTest'] },
            { id: 'testrail', label: 'TestRail', aliases: [] },
          ]
          : key === 'specialization'
            ? [{ id: 'test_automation', label: 'Automacao de Testes', aliases: ['QA Automation'] }]
            : [],
  })) };
}

function legacyValues(overrides = {}) {
  return { type: 'remote', testAutomationTecnologies: 'Cypress.io',
    tecnologies: ['qTest', 'Tricentis qTest'], especialization: 'QA Automation', ...overrides };
}

test('converts every supported legacy field to canonical names and records safe versioned warnings', () => {
  const result = transformValues(legacyValues(), configuration());
  assert.deepEqual(result.values, { type: 'remote', testAutomationTechnologies: 'cypress',
    qaTools: ['qtest'], specialization: 'test_automation' });
  assert.equal(result.audit.version, LEGACY_VACANCY_TRANSFORMER_VERSION);
  assert.deepEqual(result.audit.sourceFields,
    ['especialization', 'tecnologies', 'testAutomationTecnologies']);
  assert.equal(JSON.stringify(result).includes('Cypress.io'), false);
  assert.equal(JSON.stringify(result.audit).includes('qTest'), false);
});

test('accepts technologies as a historical qaTools alias and normalizes through the published catalog', () => {
  const result = transformValues({ technologies: ['Tricentis qTest', 'QTEST'] }, configuration());
  assert.deepEqual(result.values, { qaTools: ['qtest'] });
  assert.deepEqual(result.audit.sourceFields, ['technologies']);
});

test('consolidates equivalent canonical and legacy values once without duplicate Match input', () => {
  const result = transformValues({ qaTools: ['qTest'],
    tecnologies: ['Tricentis qTest', 'qtest'] }, configuration());
  assert.deepEqual(result.values, { qaTools: ['qtest'] });
  assert.equal(result.values.qaTools.length, 1);
});

test('rejects conflicting canonical and legacy values instead of choosing silently', () => {
  assert.throws(() => transformValues({ qaTools: ['qTest'], tecnologies: ['TestRail'] }, configuration()),
    { statusCode: 400, message: 'Conflito entre qaTools e seus aliases legados' });
});

test('transformation is deterministic and idempotent for the same version', () => {
  const first = transformValues(legacyValues(), configuration());
  const second = transformValues(first.values, configuration());
  assert.deepEqual(second.values, first.values);
  assert.equal(second.audit, null);
  assert.deepEqual(transformValues(legacyValues(), configuration()), first);
});

test('import persists only canonical fields while keeping origin, external id and private audit', async (context) => {
  const published = configuration();
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => published }));
  const imported = await prepareImportedVacancyData({ source: 'legacy-board', sourceId: 'job-83' }, {
    reference: 'job-83', title: 'QA Engineer', description: 'Quality assurance',
    matchProfile: { values: legacyValues() },
  });
  assert.deepEqual(imported.matchProfile.values.testAutomationTechnologies, ['cypress']);
  assert.deepEqual(imported.matchProfile.values.qaTools, ['qtest']);
  assert.deepEqual(imported.matchProfile.values.specialization, ['test_automation']);
  assert.equal(imported.origin, 'IMPORTED');
  assert.deepEqual([imported.importSource, imported.importSourceId], ['legacy-board', 'job-83']);
  assert.equal(imported.importMappingAudit.compatibility.version, 'LEGACY_V1');
  const response = new Vacancy(imported).toJSON();
  const serialized = JSON.stringify(response);
  for (const legacy of ['testAutomationTecnologies', 'tecnologies', 'technologies', 'especialization']) {
    assert.equal(serialized.includes(legacy), false);
    assert.equal(Vacancy.schema.path(`matchProfile.values.${legacy}`), undefined);
  }
  assert.ok(Vacancy.schema.path('matchProfile.values.qaTools'));
  assert.equal(response.importMappingAudit, undefined);
});

test('transformLegacyVacancyInput rejects unpublished aliases without mutating input', async () => {
  const input = { matchProfile: { values: { technologies: ['unknown tool'] } } };
  await assert.rejects(transformLegacyVacancyInput(input, configuration()), { statusCode: 400 });
  assert.deepEqual(input, { matchProfile: { values: { technologies: ['unknown tool'] } } });
});
