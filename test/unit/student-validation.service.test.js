require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const config = require('../../src/config/env');
const StudentAuthorization = require('../../src/models/student-authorization.model');
const {
  validateStudent,
  validateStudentEligibility,
} = require('../../src/services/student-validation.service');
const {
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../../src/config/candidate');

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function registry(context, record) {
  const original = config.studentValidation.source;
  config.studentValidation.source = ELIGIBILITY_SOURCE.MONGODB;
  context.after(() => { config.studentValidation.source = original; });
  context.mock.method(StudentAuthorization, 'init', async () => StudentAuthorization);
  return context.mock.method(StudentAuthorization, 'findOne', () => ({ select: async () => record }));
}

test('unconfigured source stays pending without trusting proof or querying the registry', async (context) => {
  const init = context.mock.method(StudentAuthorization, 'init', () => assert.fail('must not initialize registry'));
  const find = context.mock.method(StudentAuthorization, 'findOne', () => assert.fail('must not query registry'));
  assert.deepEqual(await validateStudentEligibility('maria@example.com', {
    purchaseCode: 'claimed-purchase',
  }), {
    status: ELIGIBILITY_STATUS.PENDING,
    method: ELIGIBILITY_METHOD.PURCHASE_CODE,
    source: ELIGIBILITY_SOURCE.PENDING,
  });
  assert.equal(await validateStudent('maria@example.com', 'claimed-purchase'), 'pending');
  assert.equal(init.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 0);
});

test('unknown source cannot silently fall back to another adapter', async (context) => {
  const original = config.studentValidation.source;
  config.studentValidation.source = 'sales-platform';
  context.after(() => { config.studentValidation.source = original; });
  const find = context.mock.method(StudentAuthorization, 'findOne', () => assert.fail('must not query MongoDB'));
  await assert.rejects(validateStudentEligibility('maria@example.com'), { statusCode: 503 });
  assert.equal(find.mock.callCount(), 0);
});

for (const [record, expectedStatus] of [
  [null, ELIGIBILITY_STATUS.REJECTED],
  [{ status: 'denied' }, ELIGIBILITY_STATUS.REJECTED],
  [{ status: 'pending' }, ELIGIBILITY_STATUS.PENDING],
  [{ status: 'authorized' }, ELIGIBILITY_STATUS.APPROVED],
  [{ status: 'unexpected' }, ELIGIBILITY_STATUS.REJECTED],
]) {
  test(`authoritative registry maps ${record?.status || 'missing'} to ${expectedStatus}`, async (context) => {
    const find = registry(context, record);
    const result = await validateStudentEligibility(' MARIA@Example.COM ');
    assert.equal(result.status, expectedStatus);
    assert.equal(result.method, ELIGIBILITY_METHOD.EMAIL);
    assert.equal(result.source, ELIGIBILITY_SOURCE.MONGODB);
    assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
    assert.equal(await validateStudent('maria@example.com'), expectedStatus === ELIGIBILITY_STATUS.APPROVED
      ? 'verified'
      : expectedStatus);
  });
}

test('authorized normalized email is sufficient and ignores untrusted optional proof', async (context) => {
  registry(context, { status: 'authorized', purchaseCodeHash: hash('correct-code') });
  const result = await validateStudentEligibility('maria@example.com', { purchaseCode: 'wrong-code' });
  assert.deepEqual(result, {
    status: ELIGIBILITY_STATUS.APPROVED,
    method: ELIGIBILITY_METHOD.EMAIL,
    source: ELIGIBILITY_SOURCE.MONGODB,
  });
});

test('pending registry entry can be approved by purchase code bound to its email', async (context) => {
  const purchaseCode = 'trusted-purchase-code';
  const find = registry(context, { status: 'pending', purchaseCodeHash: hash(purchaseCode) });
  assert.deepEqual(await validateStudentEligibility('maria@example.com', { purchaseCode }), {
    status: ELIGIBILITY_STATUS.APPROVED,
    method: ELIGIBILITY_METHOD.PURCHASE_CODE,
    source: ELIGIBILITY_SOURCE.MONGODB,
  });
  assert.equal(await validateStudent('maria@example.com', { purchaseCode: 'wrong-code' }), 'rejected');
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
  assert.equal(JSON.stringify(find.mock.calls[0].arguments).includes(purchaseCode), false);
});

test('pending registry entry can be approved by another trusted identifier hash', async (context) => {
  const trustedIdentifier = 'approved-student-id';
  registry(context, { status: 'pending', trustedIdentifierHash: hash(trustedIdentifier) });
  assert.deepEqual(await validateStudentEligibility('maria@example.com', { trustedIdentifier }), {
    status: ELIGIBILITY_STATUS.APPROVED,
    method: ELIGIBILITY_METHOD.TRUSTED_IDENTIFIER,
    source: ELIGIBILITY_SOURCE.MONGODB,
  });
});

test('uses the matching proof method when alternatives are submitted', async (context) => {
  const trustedIdentifier = 'approved-student-id';
  registry(context, {
    status: 'pending',
    purchaseCodeHash: hash('correct-purchase'),
    trustedIdentifierHash: hash(trustedIdentifier),
  });
  const trustedResult = await validateStudentEligibility('maria@example.com', {
    purchaseCode: 'wrong-purchase', trustedIdentifier,
  });
  assert.equal(trustedResult.status, ELIGIBILITY_STATUS.APPROVED);
  assert.equal(trustedResult.method, ELIGIBILITY_METHOD.TRUSTED_IDENTIFIER);

  const purchaseResult = await validateStudentEligibility('maria@example.com', {
    purchaseCode: 'correct-purchase', trustedIdentifier,
  });
  assert.equal(purchaseResult.method, ELIGIBILITY_METHOD.PURCHASE_CODE);
});

test('wrong or malformed proofs reject a pending registry entry', async (context) => {
  registry(context, { status: 'pending', purchaseCodeHash: 'bad-hash' });
  const result = await validateStudentEligibility('maria@example.com', {
    purchaseCode: 'wrong', trustedIdentifier: 'wrong',
  });
  assert.deepEqual(result, {
    status: ELIGIBILITY_STATUS.REJECTED,
    method: ELIGIBILITY_METHOD.MULTIPLE,
    source: ELIGIBILITY_SOURCE.MONGODB,
  });
});

test('registry lookup failures become 503 without exposing technical details', async (context) => {
  const find = registry(context, null);
  find.mock.mockImplementation(() => ({ select: async () => { throw new Error('connection secret'); } }));
  await assert.rejects(validateStudentEligibility('maria@example.com'), {
    statusCode: 503,
    message: 'Fonte de validacao temporariamente indisponivel',
  });
});

test('registry initialization failure prevents lookups and becomes 503', async (context) => {
  const original = config.studentValidation.source;
  config.studentValidation.source = ELIGIBILITY_SOURCE.MONGODB;
  context.after(() => { config.studentValidation.source = original; });
  context.mock.method(StudentAuthorization, 'init', async () => { throw new Error('index unavailable'); });
  const find = context.mock.method(StudentAuthorization, 'findOne', () => assert.fail('must not query incomplete registry'));
  await assert.rejects(validateStudentEligibility('maria@example.com', {
    trustedIdentifier: 'private-proof',
  }), { statusCode: 503 });
  assert.equal(find.mock.callCount(), 0);
});

test('duplicate trusted proof indexes make the validation source unavailable', async (context) => {
  const original = config.studentValidation.source;
  config.studentValidation.source = ELIGIBILITY_SOURCE.MONGODB;
  context.after(() => { config.studentValidation.source = original; });
  context.mock.method(StudentAuthorization, 'init', async () => {
    throw Object.assign(new Error('duplicate proof'), { code: 11000 });
  });
  await assert.rejects(validateStudentEligibility('maria@example.com'), {
    statusCode: 503,
    message: 'Fonte de validacao temporariamente indisponivel',
  });
});

test('authorization records normalize unique email, discard raw proof and hide unique hashes', () => {
  const record = new StudentAuthorization({
    email: ' MARIA@Example.COM ',
    purchaseCode: 'raw-purchase-code',
    trustedIdentifier: 'raw-trusted-identifier',
  });
  assert.equal(record.status, 'pending');
  assert.equal(record.email, 'maria@example.com');
  assert.equal(record.toObject().purchaseCode, undefined);
  assert.equal(record.toObject().trustedIdentifier, undefined);
  assert.ok(new StudentAuthorization({ email: 'invalid' }).validateSync().errors.email);
  for (const field of ['purchaseCodeHash', 'trustedIdentifierHash']) {
    const options = StudentAuthorization.schema.path(field).options;
    assert.equal(options.select, false);
    assert.equal(options.unique, true);
    assert.equal(options.sparse, true);
  }
  assert.ok(StudentAuthorization.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique));
});
