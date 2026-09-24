require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { PROPOSED_PROGRAMMING_LANGUAGES } = require('../../src/config/programming-languages');
const configurationController = require('../../src/controllers/match-profile-configuration.controller');
const { publishConfiguration } = require('../../src/services/match-profile-configuration.service');
const { registerMatchProfile } = require('../../src/services/candidate-match-profile.service');
const { prepareVacancyContent } = require('../../src/services/vacancy-content.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const candidate = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b9';
const field = 'programmingLanguages';

function proposal() {
  return { fields: Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
    [key, { weight, options: key === field ? PROPOSED_PROGRAMMING_LANGUAGES.map((language) => ({
      ...language, aliases: [...language.aliases],
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

test('admin publishes proposed languages through existing versioned configuration endpoint', async (context) => {
  const { create } = setup(context);
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await configurationController.publish({ user: admin, body: proposal() }, response,
    () => assert.fail('Publicacao valida nao deve falhar'));
  assert.equal(response.code, 200);
  assert.equal(response.body.configuration.version, 1);
  const options = response.body.configuration.fields.find((item) => item.key === field).options;
  assert.equal(options.length, 12);
  assert.deepEqual(['javascript', 'typescript', 'java'].map((id) =>
    options.find((option) => option.id === id)?.id), ['javascript', 'typescript', 'java']);
  assert.equal(new Set(options.map((option) => option.id)).size, options.length);
  assert.equal(create.mock.callCount(), 1);
});

test('candidate and vacancy persist the same Python ID once and match by configured weight', async (context) => {
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
    'Python', 'python', 'PYTHON',
  ] } });
  const vacancy = await prepareVacancyContent({ reference: 'qa-python', title: 'QA Python',
    description: 'Automacao em Python', matchProfile: { values: {
      type: 'remote', [field]: ['Python', 'python'],
    } } });
  assert.deepEqual(profile.values[field], ['python']);
  assert.deepEqual(vacancy.matchProfile.values[field], ['python']);
  const score = calculateCompetencyMatch({ configuration: await Configuration.findOne().sort(),
    vacancyValues: vacancy.matchProfile.values, candidateValues: profile.values.toObject(),
    requirements: [{ field, id: 'python', importance: 'required' }],
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 } });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [9, 9, 100]);
  assert.equal(score.details.filter((detail) => detail.id === 'python').length, 1);
});

test('unpublished free text is rejected without changing catalog or writing profile', async (context) => {
  const state = setup(context);
  await publishConfiguration(admin, proposal());
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  const createProfile = context.mock.method(MatchProfile, 'create', async () => assert.fail('Nao deve gravar'));
  await assert.rejects(registerMatchProfile(candidate, { values: { [field]: 'Cobol nao publicado' } }),
    { statusCode: 400 });
  await assert.rejects(prepareVacancyContent({ reference: 'qa', title: 'QA', description: 'QA',
    matchProfile: { values: { [field]: 'Cobol nao publicado' } } },
  { allowUnidentified: true }), { statusCode: 400 });
  assert.equal(createProfile.mock.callCount(), 0);
  assert.equal(state.current.fields.find((item) => item.key === field).options.length, 12);
  assert.equal(state.create.mock.callCount(), 1);
});

test('Java requirement is not satisfied by JavaScript or TypeScript', () => {
  const config = new Configuration({ version: 1, createdBy: admin.id,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight,
      options: key === field ? PROPOSED_PROGRAMMING_LANGUAGES : [],
    })) });
  for (const language of ['javascript', 'typescript']) {
    const score = calculateCompetencyMatch({ configuration: config,
      vacancyValues: { [field]: ['java'] }, candidateValues: { [field]: [language] },
      requirements: [{ field, id: 'java', importance: 'required' }],
      multipliers: { required: 1, desirable: 0.5, indifferent: 0 } });
    assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [0, 9, 0]);
  }
});

test('C, C++ and C# remain distinct and candidate extras do not reduce Java match', () => {
  const options = [...PROPOSED_PROGRAMMING_LANGUAGES,
    { id: 'c', label: 'C', aliases: [] }];
  const config = { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
    key, weight, options: key === field ? options : [],
  })) };
  const score = calculateCompetencyMatch({ configuration: config,
    vacancyValues: { [field]: ['java'] },
    candidateValues: { [field]: ['java', 'javascript', 'typescript', 'c', 'cpp', 'csharp'] },
    requirements: [{ field, id: 'java', importance: 'required' }],
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 } });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [9, 9, 100]);
  assert.equal(new Set(['c', 'cpp', 'csharp']).size, 3);
});

test('catalog update preserves IDs and rejects ambiguous alias without changing version', async (context) => {
  const state = setup(context);
  const initial = await publishConfiguration(admin, proposal());
  const ambiguous = proposal();
  ambiguous.fields[field].options.find((option) => option.id === 'java').aliases.push('JS');
  await assert.rejects(publishConfiguration(admin, ambiguous), { statusCode: 409 });
  const removed = proposal();
  removed.fields[field].options = removed.fields[field].options
    .filter((option) => option.id !== 'javascript');
  await assert.rejects(publishConfiguration(admin, removed), { statusCode: 409 });
  assert.equal(state.current, initial);
  assert.equal(state.current.version, 1);
  assert.equal(state.create.mock.callCount(), 1);
});
