require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const Vacancy = require('../../src/models/vacancy.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const ImportConfiguration = require('../../src/models/import-importance-configuration.model');
const MatchEngineConfiguration = require('../../src/models/match-engine-configuration.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { publishConfiguration } = require('../../src/services/match-profile-configuration.service');
const { registerMatchProfile,
  updateMatchProfile } = require('../../src/services/candidate-match-profile.service');
const { registerImportedVacancy } = require('../../src/services/vacancy-origin.service');
const { calculateCompetencyMatch } = require('../../src/services/match-scoring.service');

const admin = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'admin' };
const user = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b9';
const multipliers = { required: 1, desirable: 0.5, indifferent: 0 };

function inputConfiguration(alias = 'Chat GPT') {
  return { fields: Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
    [key, { weight, options: key === 'genAITools' ? [{
      id: 'chatgpt', label: 'ChatGPT', aliases: [alias],
    }] : [] }])) };
}

function setupConfiguration(context) {
  let current = null;
  context.mock.method(Configuration, 'init', async () => Configuration);
  context.mock.method(Configuration, 'findOne', () => ({ sort: async () => current }));
  const create = context.mock.method(Configuration, 'create', async (data) => {
    current = new Configuration(data);
    return current;
  });
  return { create, get current() { return current; } };
}

function setupCandidate(context) {
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  context.mock.method(MatchProfile, 'init', async () => MatchProfile);
  context.mock.method(MatchProfile, 'findOne', async () => null);
  return context.mock.method(MatchProfile, 'create', async (data) => new MatchProfile(data));
}

function setupImportedVacancy(context, importance = 'required') {
  context.mock.method(MatchEngineConfiguration, 'findOne', () => ({ sort: async () => null }));
  context.mock.method(ImportConfiguration, 'findOne', () => ({ sort: async () => ({
    version: 1, importance,
  }) }));
  context.mock.method(Vacancy, 'init', async () => Vacancy);
  context.mock.method(Vacancy, 'findOne', async () => null);
  context.mock.method(Vacancy, 'create', async (data) => new Vacancy(data));
}

test('canonical and legacy ChatGPT representations persist and score only genAITools once', async (context) => {
  const state = setupConfiguration(context);
  await publishConfiguration(admin, inputConfiguration());
  setupCandidate(context);
  const profile = await registerMatchProfile(user, { values: {
    genAITools: ['chatgpt'], genAITecnologies: ['Chat GPT', 'ChatGPT'],
  } });
  assert.deepEqual(profile.values.genAITools, ['chatgpt']);
  assert.equal(profile.values.genAITecnologies, undefined);
  assert.equal(profile.legacyAiMigrationHistory.length, 1);
  assert.equal(profile.legacyAiMigrationHistory[0].entries.every((entry) =>
    entry.status === 'mapped' && entry.canonicalId === 'chatgpt'), true);
  assert.equal(profile.toJSON().legacyAiMigrationHistory, undefined);
  const score = calculateCompetencyMatch({ configuration: state.current,
    vacancyValues: { genAITools: ['chatgpt'], genAITecnologies: ['Chat GPT'],
      hasGenAI: true, amountOfGenAITools: 3 },
    candidateValues: { genAITools: profile.values.genAITools,
      genAITecnologies: ['ChatGPT'], hasGenAI: true, amountOfGenAITools: 1 },
    requirements: [{ field: 'genAITools', id: 'chatgpt', importance: 'required' }],
    multipliers });
  assert.deepEqual([score.earnedPoints, score.possiblePoints, score.percentage], [5, 5, 100]);
  assert.deepEqual(score.details, [{ field: 'genAITools', id: 'chatgpt', weight: 5,
    earnedPoints: 5 }]);
});

test('unknown legacy candidate value stays pending in private audit and never scores', async (context) => {
  const state = setupConfiguration(context);
  await publishConfiguration(admin, inputConfiguration());
  const create = setupCandidate(context);
  const profile = await registerMatchProfile(user, { values: {
    genAITecnologies: ['Produto IA sem correspondencia'],
  } });
  assert.equal(profile.values.genAITools, undefined);
  assert.equal(profile.legacyAiMigrationHistory[0].entries[0].status, 'pending');
  assert.equal(profile.legacyAiMigrationHistory[0].entries[0].canonicalId, null);
  assert.equal(create.mock.callCount(), 1);
  const score = calculateCompetencyMatch({ configuration: state.current,
    vacancyValues: { genAITecnologies: ['Produto IA sem correspondencia'] },
    candidateValues: { genAITecnologies: ['Produto IA sem correspondencia'] } });
  assert.equal(score.percentage, null);
  assert.deepEqual(score.details, []);
});

test('legacy patch merges mapped AI with canonical profile and appends audit atomically', async (context) => {
  setupConfiguration(context);
  const input = inputConfiguration();
  input.fields.genAITools.options.push({ id: 'copilot', label: 'GitHub Copilot', aliases: ['Copilot'] });
  await publishConfiguration(admin, input);
  context.mock.method(Candidate, 'findOne', () => ({ select: async () => ({
    _id: candidateId, status: 'active',
  }) }));
  const current = new MatchProfile({ candidate: candidateId, user: user.id,
    configurationVersion: 1, revision: 2, values: { genAITools: ['copilot'] } });
  context.mock.method(MatchProfile, 'findOne', () => ({ lean: async () => current.toObject() }));
  const update = context.mock.method(MatchProfile, 'findOneAndUpdate', async (_filter, operation) => {
    const result = new MatchProfile(current.toObject());
    result.values.genAITools = operation.$set['values.genAITools'];
    result.revision += operation.$inc.revision;
    result.legacyAiMigrationHistory.push(operation.$push.legacyAiMigrationHistory);
    return result;
  });
  const result = await updateMatchProfile(user, { values: {
    genAITecnologies: ['Chat GPT', 'IA ainda desconhecida'],
  } }, '"2"');
  assert.deepEqual(result.profile.values.genAITools, ['chatgpt', 'copilot']);
  assert.deepEqual(update.mock.calls[0].arguments[1].$set['values.genAITools'], ['chatgpt', 'copilot']);
  assert.deepEqual(update.mock.calls[0].arguments[1].$push.legacyAiMigrationHistory.entries
    .map((entry) => entry.status), ['mapped', 'pending']);
  assert.deepEqual(current.values.genAITools, ['copilot']);
});

test('import maps trusted legacy alias with audit and published default importance', async (context) => {
  const state = setupConfiguration(context);
  await publishConfiguration(admin, inputConfiguration('OpenAI ChatGPT'));
  setupImportedVacancy(context, 'desirable');
  const vacancy = await registerImportedVacancy({ source: 'legacy-feed', sourceId: 'ai-1' }, {
    reference: 'ai-1', title: 'QA com IA', description: 'Uso de IA',
    matchProfile: { values: { genAITecnologies: ['OpenAI ChatGPT', 'ChatGPT'] } },
  });
  assert.deepEqual(vacancy.matchProfile.values.genAITools, ['chatgpt']);
  assert.equal(vacancy.matchProfile.values.genAITecnologies, undefined);
  assert.equal(vacancy.importMappingAudit.legacyAi.entries.length, 2);
  assert.equal(vacancy.importMappingAudit.legacyAi.entries.every((entry) => entry.status === 'mapped'), true);
  assert.equal(vacancy.matchProfile.requirements.length, 1);
  assert.deepEqual(vacancy.matchProfile.requirements[0].toObject(), {
    field: 'genAITools', id: 'chatgpt', importance: 'desirable', eliminatory: false,
  });
  assert.equal(vacancy.toJSON().importMappingAudit, undefined);
  const score = calculateCompetencyMatch({ configuration: state.current,
    vacancy: { origin: 'IMPORTED' }, vacancyValues: vacancy.matchProfile.values.toObject(),
    candidateValues: { genAITools: ['chatgpt'] }, requirements: vacancy.matchProfile.requirements,
    multipliers });
  assert.deepEqual([score.earnedPoints, score.possiblePoints], [2.5, 2.5]);
});

test('ambiguous or unknown imported legacy value remains pending without requirement', async (context) => {
  setupConfiguration(context);
  await publishConfiguration(admin, inputConfiguration());
  setupImportedVacancy(context);
  const vacancy = await registerImportedVacancy({ source: 'legacy-feed', sourceId: 'ai-2' }, {
    reference: 'ai-2', title: 'QA', description: 'IA desconhecida',
    matchProfile: { values: { genAITecnologies: 'IA sem catalogo' } },
  });
  assert.deepEqual(vacancy.matchProfile.values.toObject(), {});
  assert.equal(vacancy.matchProfile.requirements.length, 0);
  assert.equal(vacancy.importMappingAudit.legacyAi.entries[0].status, 'pending');
});

test('catalog alias update is versioned without silently rewriting existing profiles', async (context) => {
  const state = setupConfiguration(context);
  const first = await publishConfiguration(admin, inputConfiguration());
  const profile = new MatchProfile({ candidate: candidateId, user: user.id,
    configurationVersion: first.version, values: { genAITools: ['chatgpt'] } });
  const rewrite = context.mock.method(MatchProfile, 'updateMany', async () =>
    assert.fail('Perfil nao deve ser regravado'));
  const second = await publishConfiguration(admin, inputConfiguration('OpenAI ChatGPT'));
  assert.equal(second.version, 2);
  assert.equal(profile.configurationVersion, 1);
  assert.deepEqual(profile.values.genAITools, ['chatgpt']);
  assert.equal(rewrite.mock.callCount(), 0);
  assert.equal(state.create.mock.callCount(), 2);
});
