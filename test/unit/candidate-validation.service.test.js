require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const studentValidation = require('../../src/services/student-validation.service');
const { validateCandidateEligibility } = require('../../src/services/candidate.service');
const {
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../../src/config/candidate');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';
const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
const otherId = '6512f1e2b3a1c2d3e4f5a6b8';
const input = { _id: candidateId, user: ownerId, name: 'Maria', email: 'maria@example.com' };

function isolate(context, options = {}) {
  const candidate = new Candidate({ ...input, status: options.candidateStatus, eligibility: options.eligibility });
  const account = new User({
    _id: ownerId,
    name: 'Maria',
    email: options.accountEmail || candidate.email,
    role: options.accountRole || 'candidate',
    status: options.accountStatus || 'active',
  });
  context.mock.method(Candidate, 'findById', async () => options.missing ? null : candidate);
  const findUser = context.mock.method(User, 'findById', () => ({
    select: async () => options.missingAccount ? null : account,
  }));
  const validation = context.mock.method(
    studentValidation,
    'validateStudentEligibility',
    async () => options.result || {
      status: ELIGIBILITY_STATUS.APPROVED,
      method: ELIGIBILITY_METHOD.EMAIL,
      source: ELIGIBILITY_SOURCE.MONGODB,
    }
  );
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, operation) => {
    if (options.concurrentChange) return null;
    candidate.set(operation.$set);
    return candidate;
  });
  return { candidate, findUser, validation, update };
}

test('authorized email approves the owner and moves only to incomplete profile', async (context) => {
  const { candidate, validation, update } = isolate(context);
  const result = await validateCandidateEligibility(candidateId, ownerId, {});
  assert.equal(result.statusCode, 200);
  assert.equal(result.candidate.status, CANDIDATE_STATUS.INCOMPLETE_PROFILE);
  assert.equal(result.candidate.visibleToCompanies, false);
  assert.equal(result.candidate.eligibility.status, ELIGIBILITY_STATUS.APPROVED);
  assert.equal(result.candidate.eligibility.method, ELIGIBILITY_METHOD.EMAIL);
  assert.ok(result.candidate.eligibility.lastAttemptAt instanceof Date);
  assert.equal(result.candidate.eligibility.approvedAt, result.candidate.eligibility.lastAttemptAt);
  assert.deepEqual(validation.mock.calls[0].arguments, [candidate.email, {}]);
  assert.equal(update.mock.callCount(), 1);
});

for (const method of [ELIGIBILITY_METHOD.PURCHASE_CODE, ELIGIBILITY_METHOD.TRUSTED_IDENTIFIER]) {
  test(`approved ${method} is persisted without storing submitted evidence`, async (context) => {
    const evidence = method === ELIGIBILITY_METHOD.PURCHASE_CODE
      ? { purchaseCode: 'private-purchase-code' }
      : { trustedIdentifier: 'private-identifier' };
    const { candidate, update } = isolate(context, {
      result: { status: ELIGIBILITY_STATUS.APPROVED, method, source: ELIGIBILITY_SOURCE.MONGODB },
    });
    const response = await validateCandidateEligibility(candidateId, ownerId, evidence);
    const persisted = update.mock.calls[0].arguments[1].$set;
    assert.equal(response.statusCode, 200);
    assert.equal(persisted.eligibility.method, method);
    assert.equal(JSON.stringify(persisted).includes(Object.values(evidence)[0]), false);
    assert.equal(candidate.toJSON().purchaseCode, undefined);
    assert.equal(candidate.toJSON().trustedIdentifier, undefined);
  });
}

test('inconclusive validation returns 202, stays pending and remains hidden', async (context) => {
  const { candidate, update } = isolate(context, {
    result: {
      status: ELIGIBILITY_STATUS.PENDING,
      method: ELIGIBILITY_METHOD.EMAIL,
      source: ELIGIBILITY_SOURCE.PENDING,
    },
  });
  const result = await validateCandidateEligibility(candidateId, ownerId);
  assert.equal(result.statusCode, 202);
  assert.equal(result.candidate.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  assert.equal(result.candidate.eligibility.status, ELIGIBILITY_STATUS.PENDING);
  assert.equal(result.candidate.eligibility.approvedAt, null);
  assert.equal(result.candidate.visibleToCompanies, false);
  assert.equal(update.mock.callCount(), 1);
});

test('definitively ineligible candidate records the outcome and receives 422 without activation', async (context) => {
  const { candidate, update } = isolate(context, {
    result: {
      status: ELIGIBILITY_STATUS.REJECTED,
      method: ELIGIBILITY_METHOD.PURCHASE_CODE,
      source: ELIGIBILITY_SOURCE.MONGODB,
    },
  });
  await assert.rejects(validateCandidateEligibility(candidateId, ownerId, {
    purchaseCode: 'wrong-code',
  }), { statusCode: 422 });
  assert.equal(candidate.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  assert.equal(candidate.eligibility.status, ELIGIBILITY_STATUS.REJECTED);
  assert.equal(candidate.visibleToCompanies, false);
  assert.equal(update.mock.callCount(), 1);
});

for (const status of [CANDIDATE_STATUS.INCOMPLETE_PROFILE, CANDIDATE_STATUS.ACTIVE]) {
  test(`already approved ${status} validation is idempotent`, async (context) => {
    const attempt = new Date('2026-09-15T10:00:00.000Z');
    const { candidate, validation, update } = isolate(context, {
      candidateStatus: status,
      eligibility: {
        status: ELIGIBILITY_STATUS.APPROVED,
        method: ELIGIBILITY_METHOD.EMAIL,
        source: ELIGIBILITY_SOURCE.MONGODB,
        lastAttemptAt: attempt,
        approvedAt: attempt,
      },
    });
    const result = await validateCandidateEligibility(candidateId, ownerId, { purchaseCode: 'ignored' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.candidate, candidate);
    assert.equal(result.candidate.status, status);
    assert.equal(validation.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });
}

test('legacy approved candidate is backfilled once without becoming active', async (context) => {
  const { candidate, validation, update } = isolate(context, {
    candidateStatus: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
  });
  const result = await validateCandidateEligibility(candidateId, ownerId);
  assert.equal(result.statusCode, 200);
  assert.equal(result.candidate.status, CANDIDATE_STATUS.INCOMPLETE_PROFILE);
  assert.equal(result.candidate.eligibility.status, ELIGIBILITY_STATUS.APPROVED);
  assert.equal(result.candidate.eligibility.method, ELIGIBILITY_METHOD.LEGACY);
  assert.equal(result.candidate.eligibility.source, ELIGIBILITY_SOURCE.LEGACY);
  assert.equal(validation.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 1);
});

for (const status of [CANDIDATE_STATUS.INACTIVE, CANDIDATE_STATUS.BLOCKED]) {
  test(`${status} candidate receives 409 with state unchanged`, async (context) => {
    const { candidate, validation, update } = isolate(context, { candidateStatus: status });
    const before = candidate.toObject();
    await assert.rejects(validateCandidateEligibility(candidateId, ownerId), { statusCode: 409 });
    assert.deepEqual(candidate.toObject(), before);
    assert.equal(validation.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });
}

test('another users candidate receives 403 before validation', async (context) => {
  const { findUser, validation, update } = isolate(context);
  await assert.rejects(validateCandidateEligibility(candidateId, otherId), { statusCode: 403 });
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(validation.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('missing candidate receives 404 before validation', async (context) => {
  const { findUser, validation, update } = isolate(context, { missing: true });
  await assert.rejects(validateCandidateEligibility(candidateId, ownerId), { statusCode: 404 });
  assert.equal(findUser.mock.callCount(), 0);
  assert.equal(validation.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('candidate email must still match the normalized authenticated account email', async (context) => {
  const { candidate, validation, update } = isolate(context, { accountEmail: 'new@example.com' });
  const before = candidate.toObject();
  await assert.rejects(validateCandidateEligibility(candidateId, ownerId, {
    purchaseCode: 'proof-for-another-email',
  }), { statusCode: 409 });
  assert.deepEqual(candidate.toObject(), before);
  assert.equal(validation.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

for (const account of [{ missingAccount: true }, { accountStatus: 'inactive' }, { accountRole: 'company' }]) {
  test(`current account state ${JSON.stringify(account)} is enforced by the service`, async (context) => {
    const { validation, update } = isolate(context, account);
    const expectedStatus = account.accountRole ? 403 : 401;
    await assert.rejects(validateCandidateEligibility(candidateId, ownerId), { statusCode: expectedStatus });
    assert.equal(validation.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });
}

test('validation source outage returns 503 and leaves candidate state entirely unchanged', async (context) => {
  const { candidate, validation, update } = isolate(context);
  const failure = Object.assign(new Error('source unavailable'), { statusCode: 503 });
  validation.mock.mockImplementation(async () => { throw failure; });
  const before = candidate.toObject();
  await assert.rejects(validateCandidateEligibility(candidateId, ownerId), (error) => error === failure);
  assert.deepEqual(candidate.toObject(), before);
  assert.equal(update.mock.callCount(), 0);
});

test('concurrent status change prevents stale validation from being persisted', async (context) => {
  isolate(context, { concurrentChange: true });
  await assert.rejects(validateCandidateEligibility(candidateId, ownerId), { statusCode: 409 });
});
