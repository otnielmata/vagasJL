require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { QA_MANAGEMENT_FIELD_LABEL,
  PROPOSED_QA_MANAGEMENT_TOOLS } = require('../../src/config/qa-management-tools');
const configurationController = require('../../src/controllers/match-profile-configuration.controller');
const { publishConfiguration } = require('../../src/services/match-profile-configuration.service');
const { registerMatchProfile } = require('../../src/services/candidate-match-profile.service');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const candidate = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b9';
const field = 'qaTools';

function proposal() {
  return { fields: Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
    [key, { ...(key === field ? { label: QA_MANAGEMENT_FIELD_LABEL } : {}), weight,
      options: key === field ? PROPOSED_QA_MANAGEMENT_TOOLS.map((tool) => ({
        ...tool, aliases: [...tool.aliases],
      })) : [] }])) };
}

function setup(context) {
  let current = null;
  context.mock.method(Configuration, 'init', async () => Configuration);
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => current }));
  const create = context.mock.method(Configuration, 'create', async (data) => {
    current = new Configuration(data);
    return current;
  });
  return { create, get current() { return current; } };
}

test('canonical qaTools key exposes the clear presentation label', async (context) => {
  setup(context);
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await configurationController.publish({ user: admin, body: proposal() }, response,
    () => assert.fail('Publicacao valida nao deve falhar'));
  assert.equal(response.code, 200);
  const metadata = response.body.configuration.fields.find((item) => item.key === field);
  assert.equal(metadata.key, 'qaTools');
  assert.equal(metadata.label, QA_MANAGEMENT_FIELD_LABEL);
  assert.equal(Object.hasOwn(response.body.configuration.fields[0], 'tecnologies'), false);
  assert.equal(Object.hasOwn(response.body.configuration.fields[0], 'technologies'), false);
});

test('admin publishes TestRail, Xray and Zephyr as unique versioned options', async (context) => {
  const { create } = setup(context);
  const configuration = await publishConfiguration(admin, proposal());
  assert.equal(configuration.version, 1);
  const options = configuration.fields.find((item) => item.key === field).options;
  assert.equal(options.length, 7);
  for (const id of ['testrail', 'xray', 'zephyr']) {
    assert.equal(options.filter((option) => option.id === id).length, 1);
  }
  assert.equal(new Set(options.map((option) => option.id)).size, options.length);
  assert.equal(create.mock.callCount(), 1);
});

test('candidate and vacancy normalize historical qTest names to one ID and one score', async (context) => {
  setup(context);
  const input = proposal();
  input.fields.type.options = [{ id: 'remote', label: 'Remoto', aliases: [] }];
  await publishConfiguration(admin, input);
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  context.mock.method(MatchProfile, 'create', async (data) => new MatchProfile(data));
  const profile = await registerMatchProfile(candidate, { values: { [field]: [
    'qTest', 'Tricentis qTest', 'QTEST',
  ] } });
  const vacancy = await prepareVacancyContent({ reference: 'qa-qtest', title: 'QA',
    description: 'Gestao de testes', matchProfile: { values: {
      type: 'remote', [field]: ['Tricentis qTest', 'qtest'],
    } } });
  assert.deepEqual(profile.values[field], ['qtest']);
  assert.deepEqual(vacancy.matchProfile.values[field], ['qtest']);
  const score = calculateCompetencyMatch({ configuration: await Configuration.findOne().sort(),
    vacancyValues: vacancy.matchProfile.values, candidateValues: profile.values.toObject(),
    requirements: [{ field, id: 'qtest', importance: 'required' }],
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 } });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [5, 5, 100]);
  assert.equal(score.details.filter((detail) => detail.id === 'qtest').length, 1);
});

test('presentation label update creates a version without rewriting legacy profile IDs', async (context) => {
  const state = setup(context);
  const first = await publishConfiguration(admin, proposal());
  const legacyProfile = new MatchProfile({ candidate: candidateId, user: candidate.id,
    configurationVersion: first.version, values: { [field]: ['testrail'] } });
  const updateProfiles = context.mock.method(MatchProfile, 'updateMany', async () =>
    assert.fail('Perfis nao devem ser regravados'));
  const renamed = proposal();
  renamed.fields[field].label = 'Ferramentas de QA, Testes e Gestão';
  const second = await publishConfiguration(admin, renamed);
  assert.equal(second.version, 2);
  assert.equal(second.fields.find((item) => item.key === field).label,
    'Ferramentas de QA, Testes e Gestão');
  assert.equal(legacyProfile.configurationVersion, 1);
  assert.deepEqual(legacyProfile.values[field], ['testrail']);
  assert.equal(updateProfiles.mock.callCount(), 0);
  assert.equal(state.create.mock.callCount(), 2);
});

test('catalog refuses ambiguous aliases and automatic overlap with automation tools', async (context) => {
  const state = setup(context);
  const initial = await publishConfiguration(admin, proposal());
  const ambiguous = proposal();
  ambiguous.fields[field].options.find((option) => option.id === 'xray').aliases.push('qTest');
  await assert.rejects(publishConfiguration(admin, ambiguous), { statusCode: 409 });
  const overlap = proposal();
  overlap.fields.testAutomationTechnologies.options = [
    { id: 'xray_automation', label: 'Xray Test Management', aliases: [] },
  ];
  await assert.rejects(publishConfiguration(admin, overlap), { statusCode: 409 });
  assert.equal(state.current, initial);
  assert.equal(state.current.version, 1);
  assert.equal(state.create.mock.callCount(), 1);
});

test('unpublished QA tool is rejected without creating an option or profile', async (context) => {
  const state = setup(context);
  await publishConfiguration(admin, proposal());
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  const createProfile = context.mock.method(MatchProfile, 'create', async () => assert.fail('Nao deve gravar'));
  await assert.rejects(registerMatchProfile(candidate, { values: {
    [field]: 'Ferramenta QA nao publicada',
  } }), { statusCode: 400 });
  assert.equal(createProfile.mock.callCount(), 0);
  assert.equal(state.current.fields.find((item) => item.key === field).options.length, 7);
});
