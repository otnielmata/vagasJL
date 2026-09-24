require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const Configuration = require('../../src/models/match-profile-configuration.model');
const MatchProfile = require('../../src/models/candidate-match-profile.model');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { showMatchProfile } = require('../../src/services/candidate-match-profile.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const owner = { id: ownerId, role: 'candidate' };
const company = { id: '6512f1e2b3a1c2d3e4f5a6b8', role: 'company' };

function isolate(context, status = 'active', values = { testAutomationTechnologies: ['cypress'], yearsOfExperience: 0 }) {
  const candidate = Candidate.hydrate({ _id: candidateId, user: ownerId, status, deletedAt: null });
  const profile = new MatchProfile({
    candidate: candidateId, user: ownerId, configurationVersion: 3, revision: 4, values,
  });
  const configuration = new Configuration({
    version: 3, createdBy: ownerId,
    fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({
      key, weight,
      options: key === 'testAutomationTechnologies'
        ? [{ id: 'cypress', label: 'Cypress', aliases: ['Cypress Framework'] }] : [],
    })),
  });
  const findCandidate = context.mock.method(Candidate, 'findOne', (filter) => {
    assert.equal(filter._id, candidateId);
    assert.equal(filter.deletedAt, null);
    return { select: async () => candidate };
  });
  const findProfile = context.mock.method(MatchProfile, 'findOne', async (filter) => {
    assert.equal(filter.candidate.toString(), candidateId);
    assert.equal(filter.deletedAt, null);
    return profile;
  });
  const findConfiguration = context.mock.method(Configuration, 'findOne', async (filter) => {
    assert.deepEqual(filter, { version: 3 });
    return configuration;
  });
  const write = context.mock.method(MatchProfile, 'findOneAndUpdate', async () => assert.fail('read cannot update'));
  return { candidate, profile, configuration, findCandidate, findProfile, findConfiguration, write };
}

test('owner sees 22 canonical keys, public labels and pending fields without internal data', async (context) => {
  const { findCandidate, write } = isolate(context, 'pending_validation');
  const result = await showMatchProfile(owner, candidateId);
  assert.equal(findCandidate.mock.calls[0].arguments[0].status, undefined);
  assert.equal(result.candidate.toString(), candidateId);
  assert.equal(result.revision, 4);
  assert.equal(Object.keys(result.values).length, 22);
  assert.deepEqual(result.values.testAutomationTechnologies, [{ id: 'cypress', label: 'Cypress' }]);
  assert.equal(result.values.yearsOfExperience, 0);
  assert.equal(result.values.agile, null);
  assert.equal(result.user, undefined);
  assert.equal(result.configurationVersion, undefined);
  assert.equal(result.createdAt, undefined);
  assert.equal(result.weight, undefined);
  assert.equal(JSON.stringify(result).includes('Cypress Framework'), false);
  assert.equal(write.mock.callCount(), 0);
});

test('company sees only an active candidate with an apt current profile', async (context) => {
  const { findCandidate, findProfile } = isolate(context);
  const result = await showMatchProfile(company, candidateId);
  assert.equal(findCandidate.mock.calls[0].arguments[0].status, 'active');
  assert.equal(findProfile.mock.callCount(), 1);
  assert.equal(result.revision, undefined);
  assert.deepEqual(result.values.testAutomationTechnologies, [{ id: 'cypress', label: 'Cypress' }]);
});

for (const status of ['pending_validation', 'incomplete_profile', 'inactive', 'blocked']) {
  test(`company cannot see ${status} candidate`, async (context) => {
    const { candidate, findCandidate, findProfile } = isolate(context, status);
    findCandidate.mock.mockImplementation((filter) => ({ select: async () => {
      assert.equal(filter.status, 'active');
      return status === 'active' ? candidate : null;
    } }));
    await assert.rejects(showMatchProfile(company, candidateId), { statusCode: 404 });
    assert.equal(findProfile.mock.callCount(), 0);
  });
}

test('company gets the same 404 for missing or unfit profile', async (context) => {
  const { findProfile, findConfiguration } = isolate(context);
  findProfile.mock.mockImplementation(async () => null);
  await assert.rejects(showMatchProfile(company, candidateId), { statusCode: 404 });
  assert.equal(findConfiguration.mock.callCount(), 0);
  findProfile.mock.mockImplementation(async () => new MatchProfile({
    candidate: candidateId, user: ownerId, configurationVersion: 3, values: {},
  }));
  await assert.rejects(showMatchProfile(company, candidateId), { statusCode: 404 });
  assert.equal(findConfiguration.mock.callCount(), 0);
});

test('other candidate receives 403 before profile read', async (context) => {
  const { findProfile } = isolate(context);
  await assert.rejects(showMatchProfile({ id: company.id, role: 'candidate' }, candidateId), { statusCode: 403 });
  assert.equal(findProfile.mock.callCount(), 0);
});

test('malformed id and forbidden role stop before storage', async (context) => {
  const { findCandidate } = isolate(context);
  await assert.rejects(showMatchProfile(owner, 'not-an-id'), { statusCode: 400 });
  await assert.rejects(showMatchProfile({ id: ownerId, role: 'admin' }, candidateId), { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 0);
});

test('owner receives 404 for missing or logically deleted current profile', async (context) => {
  const { findProfile } = isolate(context);
  findProfile.mock.mockImplementation(async () => null);
  await assert.rejects(showMatchProfile(owner, candidateId), { statusCode: 404 });
});

test('missing catalog keeps canonical ID without exposing aliases or weights', async (context) => {
  const { findConfiguration } = isolate(context);
  findConfiguration.mock.mockImplementation(async () => null);
  const result = await showMatchProfile(owner, candidateId);
  assert.deepEqual(result.values.testAutomationTechnologies, [{ id: 'cypress', label: null }]);
});
