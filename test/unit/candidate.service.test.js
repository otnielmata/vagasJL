require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../../src/models/user.model');
const Candidate = require('../../src/models/candidate.model');
const studentValidation = require('../../src/services/student-validation.service');
const { registerCandidate, revalidatePendingCandidate } = require('../../src/services/candidate.service');
const { PROFILE_FIELDS } = require('../../src/config/candidate');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';
const input = { name: 'Maria', email: 'maria@example.com' };

function isolate(context, result = 'verified') {
  const user = new User({ _id: userId, name: 'Maria', email: input.email, role: 'candidate' });
  context.mock.method(User, 'findById', () => ({ select: async () => user }));
  context.mock.method(Candidate, 'init', async () => Candidate);
  context.mock.method(Candidate, 'findOne', async () => null);
  context.mock.method(studentValidation, 'validateStudent', async () => result);
  return context.mock.method(Candidate.prototype, 'save', async function save() { return this; });
}

test('verified student transitions from pending default to incomplete profile', async (context) => {
  const save = isolate(context);
  const candidate = await registerCandidate(userId, {
    ...input, purchaseCode: 'proof', trustedIdentifier: 'approved-id', status: 'active',
    user: 'untrusted', studentVerified: true,
  });
  assert.equal(candidate.status, 'incomplete_profile');
  assert.equal(candidate.visibleToCompanies, false);
  assert.equal(candidate.user.toString(), userId);
  assert.equal(candidate.email, input.email);
  assert.equal(candidate.toJSON().purchaseCode, undefined);
  assert.equal(candidate.toJSON().trustedIdentifier, undefined);
  assert.equal(candidate.toJSON().studentVerified, undefined);
  assert.equal(save.mock.callCount(), 1);
  assert.deepEqual(studentValidation.validateStudent.mock.calls[0].arguments, [input.email, {
    purchaseCode: 'proof', trustedIdentifier: 'approved-id',
  }]);
});

test('pending validation creates hidden pending candidate with omitted and null fields UNKNOWN', async (context) => {
  isolate(context, 'pending');
  const candidate = await registerCandidate(userId, { ...input, phone: null, availability: null });
  assert.equal(candidate.status, 'pending_validation');
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
  const save = isolate(context, 'rejected');
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
  assert.equal(studentValidation.validateStudent.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});

test('cannot use another students email or purchase code to authorize the account', async (context) => {
  const save = isolate(context);
  await assert.rejects(registerCandidate(userId, { ...input, email: 'someone@example.com', purchaseCode: 'stolen' }), { statusCode: 400 });
  assert.equal(studentValidation.validateStudent.mock.callCount(), 0);
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
    assert.equal(studentValidation.validateStudent.mock.callCount(), 0);
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
  studentValidation.validateStudent.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(registerCandidate(userId, input), (error) => error === failure);
  assert.equal(save.mock.callCount(), 0);
});

test('does not disguise a validation registry conflict as a candidate duplicate', async (context) => {
  const save = isolate(context);
  const failure = Object.assign(new Error('registry duplicate'), { code: 11000 });
  studentValidation.validateStudent.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(registerCandidate(userId, input), (error) => error === failure);
  assert.equal(save.mock.callCount(), 0);
});

test('unknown validation outcome cannot authorize registration', async (context) => {
  const save = isolate(context, 'unexpected');
  await assert.rejects(registerCandidate(userId, input), /Resultado de validacao/);
  assert.equal(save.mock.callCount(), 0);
});

for (const outcome of ['pending', 'verified', 'rejected', 'unexpected']) {
  test(`revalidation handles ${outcome} without bypassing controlled status`, async (context) => {
    const candidate = new Candidate({ user: userId, ...input });
    context.mock.method(Candidate, 'findById', async () => candidate);
    context.mock.method(studentValidation, 'validateStudent', async () => outcome);
    const update = context.mock.method(Candidate, 'findOneAndUpdate', async () => ({ status: 'incomplete_profile' }));
    if (outcome === 'rejected') {
      await assert.rejects(revalidatePendingCandidate(candidate.id), { statusCode: 422 });
    } else if (outcome === 'unexpected') {
      await assert.rejects(revalidatePendingCandidate(candidate.id), /Resultado de validacao/);
    } else {
      const result = await revalidatePendingCandidate(candidate.id);
      assert.equal(result.status, outcome === 'verified' ? 'incomplete_profile' : 'pending_validation');
    }
    assert.equal(update.mock.callCount(), outcome === 'verified' ? 1 : 0);
    if (outcome === 'verified') {
      assert.deepEqual(update.mock.calls[0].arguments, [
        { _id: candidate._id, status: 'pending_validation' },
        { $set: { status: 'incomplete_profile' } }, { new: true, runValidators: true },
      ]);
    }
  });
}

test('revalidation does not unblock or activate candidates', async (context) => {
  context.mock.method(Candidate, 'findById', async () => ({ status: 'blocked' }));
  const validation = context.mock.method(studentValidation, 'validateStudent', async () => assert.fail('must not revalidate blocked candidate'));
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 409 });
  assert.equal(validation.mock.callCount(), 0);
});

test('revalidation detects missing candidate and concurrent status changes', async (context) => {
  const find = context.mock.method(Candidate, 'findById', async () => null);
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 404 });
  find.mock.mockImplementation(async () => new Candidate({ user: userId, ...input }));
  context.mock.method(studentValidation, 'validateStudent', async () => 'verified');
  context.mock.method(Candidate, 'findOneAndUpdate', async () => null);
  await assert.rejects(revalidatePendingCandidate(userId), { statusCode: 409 });
});
