require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { updateMatchProfile } = require('../../src/services/candidate-match-profile.service');

const user = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };
const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';

function isolate(context, status = 'active') {
  const candidate = Candidate.hydrate({ _id: candidateId, user: user.id, status, deletedAt: null });
  const profile = new MatchProfile({
    candidate: candidateId, user: user.id, configurationVersion: 1, revision: 2,
    values: { testAutomationTechnologies: ['cypress'], yearsOfExperience: 3, agile: ['scrum'] },
  });
  const configuration = new Configuration({
    version: 3, createdBy: user.id,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
      key, weight,
      options: key === 'type' ? [{ id: 'remote', label: 'Remoto', aliases: [] },
        { id: 'hybrid', label: 'Hibrido', aliases: [] }]
        : key === 'testAutomationTechnologies'
        ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework'] }]
        : key === 'agile' ? [{ id: 'scrum', label: 'Scrum', aliases: [] }]
          : key === 'level' ? [{ id: 'junior', label: 'Júnior', aliases: [] }] : [],
    })),
  });
  const findCandidate = context.mock.method(Candidate, 'findOne', (filter) => {
    assert.deepEqual(filter, { user: user.id, deletedAt: null });
    return { select: async () => candidate };
  });
  const findProfile = context.mock.method(MatchProfile, 'findOne', (filter) => {
    assert.equal(filter.candidate.toString(), candidateId);
    assert.equal(filter.deletedAt, null);
    return { lean: async () => profile.toObject() };
  });
  const findConfiguration = context.mock.method(Configuration, 'findOne', () => ({ sort: async () => configuration }));
  const update = context.mock.method(MatchProfile, 'findOneAndUpdate', async (filter, operation, options) => {
    assert.ok(filter.revision === 2 || filter.revision?.$exists === false);
    assert.deepEqual(options, { new: true, runValidators: true });
    const updated = new MatchProfile(profile.toObject());
    for (const [path, value] of Object.entries(operation.$set)) updated.set(path, value);
    for (const path of Object.keys(operation.$unset || {})) updated.set(path, undefined);
    if (operation.$inc) updated.revision += operation.$inc.revision;
    return updated;
  });
  return { candidate, profile, configuration, findCandidate, findProfile, findConfiguration, update };
}

test('edits only submitted field with canonical alias and advances revision atomically', async (context) => {
  const { candidate, profile, update } = isolate(context);
  const result = await updateMatchProfile(user, { values: {
    testAutomationTechnologies: ['Cypress Framework', 'cypress'],
  } }, '"2"');
  assert.deepEqual(result.profile.values.testAutomationTechnologies, ['cypress']);
  assert.deepEqual(result.profile.values.agile, ['scrum']);
  assert.equal(result.profile.values.yearsOfExperience, 3);
  assert.equal(result.profile.revision, 3);
  assert.equal(result.profile.configurationVersion, 3);
  assert.equal(result.candidateStatus, 'active');
  assert.equal(candidate.status, 'active');
  assert.equal(profile.revision, 2);
  assert.equal(update.mock.calls[0].arguments[1].$inc.revision, 1);
});

test('explicit null removes only one value and returns it as pending', async (context) => {
  const { update } = isolate(context);
  const result = await updateMatchProfile(user, { values: { yearsOfExperience: null } }, '"2"');
  assert.equal(result.profile.values.yearsOfExperience, undefined);
  assert.ok(result.profile.toJSON().pendingFields.includes('yearsOfExperience'));
  assert.deepEqual(result.profile.values.agile, ['scrum']);
  assert.deepEqual(update.mock.calls[0].arguments[1].$unset, { 'values.yearsOfExperience': 1 });
});

test('candidate edits accepted modalities without affecting other profile fields', async (context) => {
  const { update } = isolate(context);
  const result = await updateMatchProfile(user, { values: { type: ['Hibrido', 'Remoto'] } }, '"2"');
  assert.deepEqual(result.profile.values.type, ['hybrid', 'remote']);
  assert.deepEqual(result.profile.values.agile, ['scrum']);
  for (const type of [['remote', 'Remoto'], ['remote', 'remote'], 'Desconhecido']) {
    await assert.rejects(updateMatchProfile(user, { values: { type } }, '"2"'), { statusCode: 400 });
  }
  assert.equal(update.mock.callCount(), 1);
});

test('edits an older profile without revision using a conditional first revision', async (context) => {
  const { profile, findProfile, update } = isolate(context);
  findProfile.mock.mockImplementation(() => ({ lean: async () => {
    const stored = profile.toObject();
    delete stored.revision;
    return stored;
  } }));
  await updateMatchProfile(user, { values: { agile: 'scrum' } }, '"1"');
  const [filter, operation] = update.mock.calls[0].arguments;
  assert.deepEqual(filter.revision, { $exists: false });
  assert.equal(operation.$set.revision, 2);
  assert.equal(operation.$inc, undefined);
});

test('rejects unknown keys, client metadata and invalid catalog without write', async (context) => {
  const { update } = isolate(context);
  for (const body of [
    { values: { unknown: 'x' } },
    { values: { testAutomationTechnologies: 'Selenium' } },
    { values: { agile: 'scrum' }, weight: 10 },
    { values: { agile: 'scrum' }, revision: 100 },
    { values: {} },
    { values: { yearsOfExperience: -1 } },
  ]) await assert.rejects(updateMatchProfile(user, body, '"2"'), { statusCode: 400 });
  assert.equal(update.mock.callCount(), 0);
});

test('rejects unknown seniority at candidate edit without changing the revision', async (context) => {
  const { configuration, update } = isolate(context);
  configuration.fields.find((field) => field.key === 'level').options.push({
    id: 'unknown', label: 'Not Specified', aliases: ['Desconhecido'],
  });
  for (const level of ['unknown', 'Desconhecido', 'Not Specified', ['junior', 'UNKNOWN']]) {
    await assert.rejects(updateMatchProfile(user, { values: { level } }, '"2"'), { statusCode: 400 });
  }
  assert.equal(update.mock.callCount(), 0);
  const result = await updateMatchProfile(user, { values: { level: 'Júnior' } }, '"2"');
  assert.deepEqual(result.profile.values.level, ['junior']);
});

test('requires a quoted current revision and prevents stale overwrite', async (context) => {
  const { update, findCandidate } = isolate(context);
  for (const header of [undefined, '2', '"0"', '"999999999999999999"']) {
    await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, header), { statusCode: 400 });
  }
  assert.equal(findCandidate.mock.callCount(), 0);
  await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, '"1"'), { statusCode: 409 });
  assert.equal(update.mock.callCount(), 0);
  update.mock.mockImplementation(async () => null);
  await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, '"2"'), { statusCode: 409 });
});

test('returns 404 for absent candidate or deleted profile without creating one', async (context) => {
  const { findCandidate, findProfile, update } = isolate(context);
  findCandidate.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, '"2"'), { statusCode: 404 });
  findCandidate.mock.mockImplementation(() => ({ select: async () => ({ _id: candidateId, status: 'active' }) }));
  findProfile.mock.mockImplementation(() => ({ lean: async () => null }));
  await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, '"2"'), { statusCode: 404 });
  assert.equal(update.mock.callCount(), 0);
});

test('denies another role and inactive or blocked candidates', async (context) => {
  const { candidate, update, findCandidate } = isolate(context);
  await assert.rejects(updateMatchProfile({ id: user.id, role: 'company' }, { values: { agile: 'scrum' } }, '"2"'),
    { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 0);
  for (const status of ['inactive', 'blocked']) {
    candidate.status = status;
    await assert.rejects(updateMatchProfile(user, { values: { agile: 'scrum' } }, '"2"'), { statusCode: 403 });
  }
  assert.equal(update.mock.callCount(), 0);
});
