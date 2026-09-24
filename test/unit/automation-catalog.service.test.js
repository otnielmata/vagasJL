require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { PROPOSED_AUTOMATION_TOOLS } = require('../../src/config/automation-tools');
const configurationController = require('../../src/controllers/match-profile-configuration.controller');
const { publishConfiguration } = require('../../src/services/match-profile-configuration.service');
const { registerMatchProfile } = require('../../src/services/candidate-match-profile.service');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const candidate = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b9';
const field = 'testAutomationTechnologies';

function proposal() {
  return { fields: Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
    [key, { weight, options: key === field ? PROPOSED_AUTOMATION_TOOLS.map((tool) => ({
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

test('admin publishes the proposed open catalog through the existing endpoint with version', async (context) => {
  const { create } = setup(context);
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await configurationController.publish({ user: admin, body: proposal() }, response,
    () => assert.fail('Publicacao valida nao deve falhar'));
  assert.equal(response.code, 200);
  assert.equal(response.body.configuration.version, 1);
  const options = response.body.configuration.fields.find((item) => item.key === field).options;
  assert.equal(options.length, 15);
  for (const id of ['cypress', 'selenium', 'playwright']) {
    assert.equal(options.filter((option) => option.id === id).length, 1);
  }
  assert.equal(create.mock.callCount(), 1);
  assert.equal((await publishConfiguration(admin, proposal())).version, 1);
});

test('candidate and vacancy share the same Cypress ID and score it only once', async (context) => {
  setup(context);
  const input = proposal();
  input.fields.type.options = [{ id: 'remote', label: 'Remoto', aliases: [] }];
  await publishConfiguration(admin, input);
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  const createProfile = context.mock.method(MatchProfile, 'create', async (data) => new MatchProfile(data));
  const profile = await registerMatchProfile(candidate, { values: { [field]: [
    'Cypress.io', 'CYPRESS FRAMEWORK', 'cypress',
  ] } });
  const vacancy = await prepareVacancyContent({ reference: 'qa-automation', title: 'QA',
    description: 'Automacao', matchProfile: { values: {
      type: 'Remoto', [field]: ['Cypress', 'Cypress.io'],
    } } });
  assert.deepEqual(profile.values[field], ['cypress']);
  assert.deepEqual(vacancy.matchProfile.values[field], ['cypress']);
  assert.deepEqual(vacancy.matchProfile.values.type, ['remote']);
  const score = calculateCompetencyMatch({ configuration: (await Configuration.findOne().sort()),
    vacancyValues: vacancy.matchProfile.values, candidateValues: profile.values.toObject(),
    requirements: [{ field, id: 'cypress', importance: 'required' }],
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 } });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [10, 10, 100]);
  assert.equal(createProfile.mock.callCount(), 1);
});

test('unpublished free text is rejected without new ID or profile write', async (context) => {
  const state = setup(context);
  await publishConfiguration(admin, proposal());
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  const createProfile = context.mock.method(MatchProfile, 'create', async () => assert.fail('Nao deve gravar'));
  await assert.rejects(registerMatchProfile(candidate, { values: { [field]: 'Ferramenta nao catalogada' } }),
    { statusCode: 400 });
  await assert.rejects(prepareVacancyContent({ reference: 'qa', title: 'QA', description: 'QA',
    matchProfile: { values: { [field]: 'Ferramenta nao catalogada' } } },
  { allowUnidentified: true }), { statusCode: 400 });
  assert.equal(createProfile.mock.callCount(), 0);
  assert.equal(state.current.fields.find((item) => item.key === field).options.length, 15);
  assert.equal(state.create.mock.callCount(), 1);
});

test('ambiguous alias is rejected without changing current version', async (context) => {
  const state = setup(context);
  const initial = await publishConfiguration(admin, proposal());
  const changed = proposal();
  changed.fields[field].options.find((option) => option.id === 'playwright').aliases.push('Cypress.io');
  await assert.rejects(publishConfiguration(admin, changed), { statusCode: 409 });
  assert.equal(state.current, initial);
  assert.equal(state.current.version, 1);
  assert.equal(state.create.mock.callCount(), 1);
});

test('versioned changes retain published IDs while allowing additional reviewed tools', async (context) => {
  const state = setup(context);
  const initial = await publishConfiguration(admin, proposal());
  const removed = proposal();
  removed.fields[field].options = removed.fields[field].options.filter((option) => option.id !== 'cypress');
  await assert.rejects(publishConfiguration(admin, removed), { statusCode: 409 });
  assert.equal(state.current.version, 1);
  const extended = proposal();
  extended.fields[field].options.push({ id: 'approved_tool', label: 'Approved Tool', aliases: [] });
  extended.fields[field].weight = 12;
  const next = await publishConfiguration(admin, extended);
  assert.equal(next.version, 2);
  assert.equal(initial.fields.find((item) => item.key === field).weight, 10);
  assert.equal(next.fields.find((item) => item.key === field).weight, 12);
  assert.equal(next.fields.find((item) => item.key === field).options.length, 16);
});
