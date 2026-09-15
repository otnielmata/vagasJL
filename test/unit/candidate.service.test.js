require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const studentValidation = require('../../src/services/student-validation.service');
const { registerCandidate, revalidatePendingCandidate } = require('../../src/services/candidate.service');
const {
  PROFILE_FIELDS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../../src/config/candidate');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';
const input = { name: 'Maria', email: 'maria@example.com' };

const validations = {
  approved: {
    status: ELIGIBILITY_STATUS.APPROVED,
    method: ELIGIBILITY_METHOD.EMAIL,
    source: ELIGIBILITY_SOURCE.MONGODB,
  },
  pending: {
    status: ELIGIBILITY_STATUS.PENDING,
    method: ELIGIBILITY_METHOD.EMAIL,
    source: ELIGIBILITY_SOURCE.PENDING,
  },
  rejected: {
    status: ELIGIBILITY_STATUS.REJECTED,
    method: ELIGIBILITY_METHOD.EMAIL,
    source: ELIGIBILITY_SOURCE.MONGODB,
  },
};

function isolate(context, validation = validations.approved) {
  const user = new User({ _id: userId, name: 'Maria', email: input.email, role: 'candidate' });
  context.mock.method(User, 'findById', () => ({ select: async () => user }));
  context.mock.method(Candidate, 'init', async () => Candidate);
  context.mock.method(Candidate, 'findOne', async () => null);
  context.mock.method(studentValidation, 'validateStudentEligibility', async () => validation);
  return context.mock.method(Candidate.prototype, 'save', async function save() { return this; });
}

function isolateRevalidation(context, validation, candidate = new Candidate({ user: userId, ...input })) {
  context.mock.method(Candidate, 'findById', async () => candidate);
  context.mock.method(studentValidation, 'validateStudentEligibility', async () => validation);
  const update = context.mock.method(Candidate, 'findOneAndUpdate', async (_filter, operation) => {
    candidate.set(operation.$set);
    return candidate;
  });
  return { candidate, update };
}

test('approved student transitions to incomplete profile and persists validation metadata', async (context) => {
  const save = isolate(context);
  const candidate = await registerCandidate(userId, {
    ...input,
    purchaseCode: 'proof',
    trustedIdentifier: 'approved-id',
    status: 'active',
    user: 'untrusted',
    studentVerified: true,
  });
  assert.equal(candidate.status, 'incomplete_profile');
  assert.equal(candidate.visibleToCompanies, false);
  assert.equal(candidate.user.toString(), userId);
  assert.equal(candidate.email, input.email);
  assert.equal(candidate.eligibility.status, ELIGIBILITY_STATUS.APPROVED);
  assert.equal(candidate.eligibility.method, ELIGIBILITY_METHOD.EMAIL);
  assert.equal(candidate.eligibility.source, ELIGIBILITY_SOURCE.MONGODB);
  assert.ok(candidate.eligibility.lastAttemptAt instanceof Date);
  assert.equal(candidate.eligibility.approvedAt, candidate.eligibility.lastAttemptAt);
  assert.equal(candidate.toJSON().eligibility.source, undefined);
  assert.equal(candidate.toJSON().purchaseCode, undefined);
  assert.equal(candidate.toJSON().trustedIdentifier, undefined);
  assert.equal(candidate.toJSON().studentVerified, undefined);
  assert.equal(save.mock.callCount(), 1);
  assert.deepEqual(studentValidation.validateStudentEligibility.mock.calls[0].arguments, [input.email, {
    purchaseCode: 'proof', trustedIdentifier: 'approved-id',
  }]);
});

test('pending validation creates hidden candidate with metadata and omitted fields UNKNOWN', async (context) => {
  isolate(context, validations.pending);
  const candidate = await registerCandidate(userId, { ...input, phone: null, availability: null });
  assert.equal(candidate.status, 'pending_validation');
  assert.equal(candidate.eligibility.status, ELIGIBILITY_STATUS.PENDING);
  assert.equal(candidate.eligibility.approvedAt, null);
  assert.equal(candidate.visibleToCompanies, false);
  for (const field of PROFILE_FIELDS) assert.equal(candidate[field], 'UNKNOWN');
});

test('preserves supplied profile data and explicitly unavailable availability', async (context) => {
  isolate(context);
  const profile = {
    photoUrl: 'https://example.com/photo.png', phone: '+55 11 99999-9999', city: 'Sao Paulo',
    state: 'SP', country: 'Brasil', linkedinUrl: 'https://linkedin.com/in/maria',
    githubUrl: 'https://github.com/maria', portfolioUrl: 'https://example.com',
    professionalSummary: 'Profissional de testes', availability: 'unavailable',
  };
  const candidate = await registerCandidate(userId, { ...input, ...profile });
  for (const field of PROFILE_FIELDS) assert.equal(candidate[field], profile[field]);
});

test('unapproved student receives 422 and is not saved', async (context) => {
  const save = isolate(context, validations.rejected);
  await assert.rejects(registerCandidate(userId, input), { statusCode: 422 });
  assert.equal(save.mock.callCount(), 0);
});

test('existing candidate for user or email receives 409 before verification and creation', async (context) => {
  const save = isolate(context);
  Candidate.findOne.mock.mockImplementation(async () => ({ status: 'active' }));
  await assert.rejects(registerCandidate(userId, input), { statusCode: 409 });
  const filter = Candidate.findOne.mock.calls[0].arguments[0];
  assert.equal(filter.$or[0].user.toString(), userId);
  assert.deepEqual(filter.$or[1], { email: input.email, status: 'active' });
  assert.equal(studentValidation.validateStudentEligibility.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});

test('cannot use another students email or proof to authorize the account', async (context) => {
  const save = isolate(context);
  await assert.rejects(registerCandidate(userId, {
    ...input, email: 'someone@example.com', purchaseCode: 'stolen',
  }), { statusCode: 400 });
  assert.equal(studentValidation.validateStudentEligibility.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});

for (const user of [null, { status: 'inactive' }]) {
  test(`rejects ${user ? 'inactive' : 'deleted'} authenticated account with 401`, async (context) => {
    const save = isolate(context);
    User.findById.mock.mockImplementation(() => ({ select: async () => user }));
    await assert.rejects(registerCandidate(userId, input), { statusCode: 401 });
    assert.equal(save.mock.callCount(), 0);
  });
}

for (const role of ['company', 'admin']) {
  test(`rejects active ${role} account with 403 before validation or persistence`, async (context) => {
    const save = isolate(context);
    User.findById.mock.mockImplementation(() => ({
      select: async () => ({ status: 'active', email: input.email, role }),
    }));
    await assert.rejects(registerCandidate(userId, input), { statusCode: 403 });
    assert.equal(Candidate.init.mock.callCount(), 0);
    assert.equal(studentValidation.validateStudentEligibility.mock.callCount(), 0);
    assert.equal(save.mock.callCount(), 0);
  });
}

for (const [failure, statusCode] of [
  [Object.assign(new Error('duplicate key'), { code: 11000 }), 409],
  [Object.assign(new Error('invalid candidate'), { name: 'ValidationError' }), 400],
]) {
  test(`maps persistence failure to ${statusCode}`, async (context) => {
    const save = isolate(context);
    save.mock.mockImplementation(async () => { throw failure; });
    await assert.rejects(registerCandidate(userId, input), { statusCode });
  });
}

test('validation outage does not save or grant candidate status', async (context) => {
  const save = isolate(context);
  const failure = new Error('validation unavailable');
  studentValidation.validateStudentEligibility.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(registerCandidate(userId, input), (error) => error === failure);
  assert.equal(save.mock.callCount(), 0);
});

test('does not disguise a validation registry conflict as a candidate duplicate', async (context) => {
  const save = isolate(context);
  const failure = Object.assign(new Error('registry duplicate'), { code: 11000 });
  studentValidation.validateStudentEligibility.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(registerCandidate(userId, input), (error) => error === failure);
  assert.equal(save.mock.callCount(), 0);
});

test('unknown validation outcome cannot authorize registration', async (context) => {
  const save = isolate(context, { status: 'unexpected', method: 'email', source: 'mongodb' });
  await assert.rejects(registerCandidate(userId, input), /Resultado de validacao/);
  assert.equal(save.mock.callCount(), 0);
});

for (const validation of Object.values(validations)) {
  test(`administrative revalidation persists ${validation.status} without activation`, async (context) => {
    const { candidate, update } = isolateRevalidation(context, validation);
    if (validation.status === ELIGIBILITY_STATUS.REJECTED) {
      await assert.rejects(revalidatePendingCandidate(candidate.id), { statusCode: 422 });
    } else {
      const result = await revalidatePendingCandidate(candidate.id);
      assert.equal(
        result.status,
        validation.status === ELIGIBILITY_STATUS.APPROVED ? 'incomplete_profile' : 'pending_validation'
      );
    }
    assert.equal(update.mock.callCount(), 1);
    const [filter, operation, options] = update.mock.calls[0].arguments;
    assert.equal(filter._id.toString(), candidate.id);
    assert.equal(filter.user.toString(), userId);
    assert.equal(filter.status, 'pending_validation');
    assert.equal(operation.$set.eligibility.status, validation.status);
    assert.ok(operation.$set.eligibility.lastAttemptAt instanceof Date);
    assert.deepEqual(options, { new: true, runValidators: true });
    assert.notEqual(operation.$set.status, 'active');
  });
}

test('administrative revalidation rejects unknown results without writing', async (context) => {
  const { candidate, update } = isolateRevalidation(context, {
    status: 'unexpected', method: ELIGIBILITY_METHOD.EMAIL, source: ELIGIBILITY_SOURCE.MONGODB,
  });
  await assert.rejects(revalidatePendingCandidate(candidate.id), /Resultado de validacao/);
  assert.equal(update.mock.callCount(), 0);
});

test('administrative revalidation does not unblock or activate candidates', async (context) => {
  context.mock.method(Candidate, 'findById', async () => ({ status: 'blocked' }));
  const validation = context.mock.method(studentValidation, 'validateStudentEligibility', async () => {
    assert.fail('must not revalidate blocked candidate');
  });
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 409 });
  assert.equal(validation.mock.callCount(), 0);
});

test('administrative revalidation detects missing candidate and concurrent status changes', async (context) => {
  const find = context.mock.method(Candidate, 'findById', async () => null);
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 404 });
  find.mock.mockImplementation(async () => new Candidate({ user: userId, ...input }));
  context.mock.method(studentValidation, 'validateStudentEligibility', async () => validations.approved);
  context.mock.method(Candidate, 'findOneAndUpdate', async () => null);
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 409 });
});
