require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const Vacancy = require('../../src/models/vacancy.model');
const MatchEvaluation = require('../../src/models/match-evaluation.model');
const ApplicationReferral = require('../../src/models/application-referral.model');
const { referCandidateToApplication } = require('../../src/services/candidate-application.service');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';
const candidateId = '6512f1e2b3a1c2d3e4f5a6b8';
const vacancyId = '6512f1e2b3a1c2d3e4f5a6b9';
const actor = { id: userId, role: 'candidate' };
const now = new Date('2026-09-23T21:00:00.000Z');

function activeVacancy(overrides = {}) {
  return { _id: vacancyId, origin: 'COMPANY', status: 'active', deletedAt: null,
    expiresAt: null, applicationChannel: {
      type: 'https_url', value: 'https://jobs.example.com/vagas/qa-123?source=vagasjl',
    }, ...overrides };
}

function setup(context, vacancy = activeVacancy(), candidateStatus = 'active') {
  const candidateQuery = { select: async () => ({ _id: candidateId, status: candidateStatus }) };
  const vacancyQuery = { select: async () => vacancy };
  const findCandidate = context.mock.method(Candidate, 'findOne', () => candidateQuery);
  const findVacancy = context.mock.method(Vacancy, 'findById', () => vacancyQuery);
  context.mock.method(ApplicationReferral, 'init', async () => ApplicationReferral);
  let stored = null;
  const saveReferral = context.mock.method(ApplicationReferral, 'findOneAndUpdate', async (_filter, update) => {
    stored ||= { _id: 'referral-1', ...update.$setOnInsert };
    return stored;
  });
  context.mock.method(ApplicationReferral, 'findOne', async () => stored);
  const latestQuery = { sort: async () => ({ eligibility: { eligible: false,
    reason: { code: 'ELIMINATORY_REQUIREMENT_NOT_MET', field: 'automation', id: 'playwright' } } }) };
  context.mock.method(MatchEvaluation, 'findOne', () => latestQuery);
  return { candidateQuery, vacancyQuery, findCandidate, findVacancy, saveReferral,
    getStored: () => stored };
}

test('returns the official HTTPS channel as redirect_ready without claiming an external application',
  async (context) => {
    const { findCandidate, findVacancy, saveReferral, getStored } = setup(context);
    const result = await referCandidateToApplication(actor, vacancyId, now);
    assert.equal(result.state, 'redirect_ready');
    assert.equal(result.applicationConfirmed, false);
    assert.deepEqual(result.channel, { type: 'https_url',
      url: 'https://jobs.example.com/vagas/qa-123?source=vagasjl' });
    assert.equal(result.matchAdvisory.blocksApplication, false);
    assert.equal(result.matchAdvisory.eligibility.eligible, false);
    assert.equal(saveReferral.mock.callCount(), 1);
    assert.deepEqual(findCandidate.mock.calls[0].arguments[0], { user: userId, deletedAt: null });
    assert.equal(findVacancy.mock.calls[0].arguments[0], vacancyId);
    const event = getStored();
    assert.deepEqual([event.candidate, event.vacancy, event.vacancyOrigin, event.channelType,
      event.channelReference, event.state, event.privacyScope],
    [candidateId, vacancyId, 'COMPANY', 'https_url', 'jobs.example.com', 'redirect_ready',
      'minimal_referral_event']);
    assert.match(event.channelFingerprint, /^[a-f\d]{64}$/);
    assert.equal(JSON.stringify(event).includes('private@example.com'), false);
  });

test('repeated request uses the same unique telemetry event', async (context) => {
  const { getStored } = setup(context);
  const first = await referCandidateToApplication(actor, vacancyId, now);
  const second = await referCandidateToApplication(actor, vacancyId, new Date(now.getTime() + 1000));
  assert.equal(first.referral.id, second.referral.id);
  assert.equal(first.referral.recordedAt, second.referral.recordedAt);
  assert.equal(getStored().referredAt, now);
  const index = ApplicationReferral.schema.indexes().find(([, options]) =>
    options.name === 'unique_candidate_vacancy_channel_referral');
  assert.deepEqual(index[0], { candidate: 1, vacancy: 1, channelFingerprint: 1 });
  assert.equal(index[1].unique, true);
});

test('returns a normalized institutional email without sharing candidate contact data', async (context) => {
  const { getStored } = setup(context, activeVacancy({ applicationChannel: {
    type: 'email', value: ' Recrutamento@Example.com ',
  } }));
  const result = await referCandidateToApplication(actor, vacancyId, now);
  assert.deepEqual(result.channel, { type: 'email', address: 'recrutamento@example.com',
    uri: 'mailto:recrutamento@example.com' });
  assert.equal(getStored().channelReference, 'example.com');
  assert.equal(Object.hasOwn(result, 'candidate'), false);
});

for (const [status, expectedStatus] of [['paused', 409], ['expired', 409], ['removed', 404],
  ['rejected', 404]]) {
  test(`vacancy ${status} never returns an application channel`, async (context) => {
    const { saveReferral } = setup(context, activeVacancy({ status }));
    await assert.rejects(referCandidateToApplication(actor, vacancyId, now),
      { statusCode: expectedStatus });
    assert.equal(saveReferral.mock.callCount(), 0);
  });
}

test('deadline and missing channel block the redirect safely', async (context) => {
  const { vacancyQuery, saveReferral } = setup(context, activeVacancy({
    expiresAt: new Date('2026-09-23T20:59:59.000Z'),
  }));
  await assert.rejects(referCandidateToApplication(actor, vacancyId, now), { statusCode: 409 });
  vacancyQuery.select = async () => activeVacancy({ applicationChannel: null });
  await assert.rejects(referCandidateToApplication(actor, vacancyId, now), { statusCode: 409 });
  assert.equal(saveReferral.mock.callCount(), 0);
});

for (const applicationChannel of [
  { type: 'https_url', value: 'http://jobs.example.com/vaga' },
  { type: 'https_url', value: 'https://evil.example.net/vaga' },
  { type: 'https_url', value: 'https://jobs.example.com/vaga?redirect=https://evil.example' },
  { type: 'email', value: 'jobs@evil.example.net' },
]) {
  test(`unsafe channel ${applicationChannel.value} fails without telemetry`, async (context) => {
    const { saveReferral } = setup(context, activeVacancy({ applicationChannel }));
    await assert.rejects(referCandidateToApplication(actor, vacancyId, now), { statusCode: 503 });
    assert.equal(saveReferral.mock.callCount(), 0);
  });
}

test('blocked candidate cannot receive or audit a channel', async (context) => {
  const { findVacancy, saveReferral } = setup(context, activeVacancy(), 'blocked');
  await assert.rejects(referCandidateToApplication(actor, vacancyId, now), { statusCode: 403 });
  assert.equal(findVacancy.mock.callCount(), 0);
  assert.equal(saveReferral.mock.callCount(), 0);
});

test('invalid actor and vacancy identifier fail before storage', async (context) => {
  const { findCandidate, saveReferral } = setup(context);
  await assert.rejects(referCandidateToApplication({ ...actor, role: 'company' }, vacancyId, now),
    { statusCode: 403 });
  await assert.rejects(referCandidateToApplication(actor, 'invalid', now), { statusCode: 400 });
  assert.equal(findCandidate.mock.callCount(), 0);
  assert.equal(saveReferral.mock.callCount(), 0);
});
