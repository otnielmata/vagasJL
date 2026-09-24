require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const CandidateMatchProfile = require('../../src/models/candidate-match-profile.model');
const {
  updateOwnOpportunityAvailability,
  normalizeInput,
} = require('../../src/services/candidate-opportunity-availability.service');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';

function candidate(overrides = {}) {
  return Candidate.hydrate({
    _id: candidateId,
    user: ownerId,
    name: 'Maria',
    email: 'maria@example.com',
    status: 'active',
    eligibility: { status: 'approved', method: 'email', source: 'mongodb' },
    availableForOpportunities: false,
    opportunityAvailabilityChangedAt: null,
    opportunitySearchCacheVersion: 1,
    deletedAt: null,
    ...overrides,
  });
}

function isolate(context, current = candidate(), profile = { _id: 'profile' }) {
  const findCandidate = context.mock.method(Candidate, 'findOne', () => ({
    select: async () => current,
  }));
  const findProfile = context.mock.method(CandidateMatchProfile, 'findOne', () => ({
    select: async () => profile,
  }));
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, operation) => {
    current.set(operation.$set);
    current.opportunitySearchCacheVersion += operation.$inc.opportunitySearchCacheVersion;
    return current;
  });
  return { current, findCandidate, findProfile, update };
}

test('active validated candidate with Match Profile explicitly enables company visibility', async (context) => {
  const { update, findProfile } = isolate(context);
  const now = new Date('2026-09-23T14:00:00.000Z');
  const result = await updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' },
    { availableForOpportunities: true },
    now
  );

  assert.deepEqual(result, {
    availableForOpportunities: true,
    changedAt: now,
    candidateStatus: 'active',
    visibleToCompanies: true,
  });
  assert.equal(findProfile.mock.callCount(), 1);
  const [filter, operation, options] = update.mock.calls[0].arguments;
  assert.equal(filter.status, 'active');
  assert.equal(filter.opportunityAvailabilityChangedAt, null);
  assert.equal(operation.$set.opportunitySearchCacheInvalidatedAt, now);
  assert.equal(operation.$inc.opportunitySearchCacheVersion, 1);
  assert.deepEqual(operation.$push.opportunityAvailabilityHistory, {
    availableForOpportunities: true, actor: ownerId, changedAt: now,
  });
  assert.deepEqual(options, { new: true, runValidators: true });
});

test('disabling removes visibility without requiring a profile and records audit', async (context) => {
  const changedAt = new Date('2026-09-22T14:00:00.000Z');
  const current = candidate({
    availableForOpportunities: true,
    opportunityAvailabilityChangedAt: changedAt,
  });
  const { findProfile, update } = isolate(context, current, null);
  const now = new Date('2026-09-23T14:00:00.000Z');
  const result = await updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' },
    { availableForOpportunities: false },
    now
  );
  assert.equal(result.availableForOpportunities, false);
  assert.equal(result.visibleToCompanies, false);
  assert.equal(result.candidateStatus, 'active');
  assert.equal(findProfile.mock.callCount(), 0);
  assert.equal(update.mock.calls[0].arguments[1].$push
    .opportunityAvailabilityHistory.availableForOpportunities, false);
});

test('candidate ranking access is independent because this service changes no status or profile data', async (context) => {
  const current = candidate({ availableForOpportunities: true,
    opportunityAvailabilityChangedAt: new Date('2026-09-22T14:00:00.000Z') });
  const { update } = isolate(context, current);
  await updateOwnOpportunityAvailability({ id: ownerId, role: 'candidate' },
    { availableForOpportunities: false });
  assert.equal(current.status, 'active');
  assert.equal(current.eligibility.status, 'approved');
  assert.equal(update.mock.calls[0].arguments[1].$set.status, undefined);
  assert.equal(update.mock.calls[0].arguments[1].$set.publicProfile, undefined);
});

test('pending, blocked, inactive, unvalidated or profileless candidate cannot enable visibility', async (context) => {
  const { findCandidate, findProfile, update } = isolate(context);
  for (const status of ['pending_validation', 'incomplete_profile', 'inactive', 'blocked']) {
    const current = candidate({ status });
    findCandidate.mock.mockImplementation(() => ({ select: async () => current }));
    await assert.rejects(updateOwnOpportunityAvailability(
      { id: ownerId, role: 'candidate' }, { availableForOpportunities: true }
    ), { statusCode: 409 });
  }
  const unvalidated = candidate({ eligibility: { status: 'pending' } });
  findCandidate.mock.mockImplementation(() => ({ select: async () => unvalidated }));
  await assert.rejects(updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: true }
  ), { statusCode: 409 });
  assert.equal(findProfile.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('profileless active candidate cannot enable but may explicitly stay unavailable', async (context) => {
  const { findProfile, update } = isolate(context, candidate(), null);
  await assert.rejects(updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: true }
  ), { statusCode: 409 });
  assert.equal(findProfile.mock.callCount(), 1);
  const unavailable = await updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: false }
  );
  assert.equal(unavailable.visibleToCompanies, false);
  assert.equal(update.mock.callCount(), 1);
});

test('candidate cannot alter another owner and unsupported role is rejected before storage', async (context) => {
  const { findCandidate, update } = isolate(context, candidate({ user: otherId }));
  await assert.rejects(updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: false }
  ), { statusCode: 403 });
  assert.equal(update.mock.callCount(), 0);
  await assert.rejects(updateOwnOpportunityAvailability(
    { id: ownerId, role: 'company' }, { availableForOpportunities: false }
  ), { statusCode: 403 });
  assert.equal(findCandidate.mock.callCount(), 1);
});

test('repeating an explicit choice is idempotent and missing candidate returns 404', async (context) => {
  const current = candidate({ availableForOpportunities: false,
    opportunityAvailabilityChangedAt: new Date('2026-09-22T14:00:00.000Z') });
  const { findCandidate, update } = isolate(context, current);
  const result = await updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: false }
  );
  assert.equal(result.changedAt, current.opportunityAvailabilityChangedAt);
  assert.equal(update.mock.callCount(), 0);
  findCandidate.mock.mockImplementation(() => ({ select: async () => null }));
  await assert.rejects(updateOwnOpportunityAvailability(
    { id: ownerId, role: 'candidate' }, { availableForOpportunities: false }
  ), { statusCode: 404 });
});

test('validates exactly one strict boolean field', () => {
  assert.equal(normalizeInput({ availableForOpportunities: true }), true);
  assert.equal(normalizeInput({ availableForOpportunities: false }), false);
  for (const input of [undefined, null, {}, [], { availableForOpportunities: 'true' },
    { availableForOpportunities: true, candidateId }]) {
    assert.throws(() => normalizeInput(input), { statusCode: 400 });
  }
});
