require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const config = require('../../src/config/env');
const StudentAuthorization = require('../../src/models/student-authorization.model');
const { validateStudent } = require('../../src/services/student-validation.service');

function registry(context, record) {
  const original = config.studentValidation.source;
  config.studentValidation.source = 'mongodb';
  context.after(() => { config.studentValidation.source = original; });
  context.mock.method(StudentAuthorization, 'init', async () => StudentAuthorization);
  return context.mock.method(StudentAuthorization, 'findOne', () => ({ select: async () => record }));
}

test('unconfigured validation returns pending without trusting client proof or querying a registry', async (context) => {
  const find = context.mock.method(StudentAuthorization, 'findOne', () => assert.fail('must not query registry'));
  assert.equal(await validateStudent('maria@example.com', 'claimed-purchase'), 'pending');
  assert.equal(find.mock.callCount(), 0);
});

for (const [record, expected] of [
  [null, 'rejected'], [{ status: 'denied' }, 'rejected'],
  [{ status: 'pending' }, 'pending'], [{ status: 'authorized' }, 'verified'],
  [{ status: 'unexpected' }, 'rejected'],
]) {
  test(`authoritative registry maps ${record?.status || 'missing'} to ${expected}`, async (context) => {
    const find = registry(context, record);
    assert.equal(await validateStudent(' MARIA@Example.COM '), expected);
    assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
  });
}

test('pending registry entry can be verified by purchase code bound to authenticated email', async (context) => {
  const purchaseCode = 'trusted-purchase-code';
  const find = registry(context, { status: 'pending', purchaseCodeHash: createHash('sha256').update(purchaseCode).digest('hex') });
  assert.equal(await validateStudent('maria@example.com', { purchaseCode }), 'verified');
  assert.equal(await validateStudent('maria@example.com', { purchaseCode: 'wrong-code' }), 'rejected');
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
});

test('pending registry entry can be verified by another approved trusted identifier', async (context) => {
  const trustedIdentifier = 'approved-student-id';
  registry(context, {
    status: 'pending',
    trustedIdentifierHash: createHash('sha256').update(trustedIdentifier).digest('hex'),
  });
  assert.equal(await validateStudent('maria@example.com', { trustedIdentifier }), 'verified');
  assert.equal(await validateStudent('maria@example.com', { trustedIdentifier: 'wrong-id' }), 'rejected');
});

test('accepts any matching approved evidence when alternatives are supplied', async (context) => {
  const trustedIdentifier = 'approved-student-id';
  registry(context, {
    status: 'pending', purchaseCodeHash: createHash('sha256').update('purchase-code').digest('hex'),
    trustedIdentifierHash: createHash('sha256').update(trustedIdentifier).digest('hex'),
  });
  assert.equal(await validateStudent('maria@example.com', {
    purchaseCode: 'wrong-code', trustedIdentifier,
  }), 'verified');
});

test('authorized email remains sufficient even when optional evidence is invalid', async (context) => {
  registry(context, { status: 'authorized', purchaseCodeHash: createHash('sha256').update('correct').digest('hex') });
  assert.equal(await validateStudent('maria@example.com', { purchaseCode: 'wrong' }), 'verified');
});

test('missing or malformed stored proof cannot validate a pending entry', async (context) => {
  registry(context, { status: 'pending', purchaseCodeHash: 'bad-hash' });
  assert.equal(await validateStudent('maria@example.com', { purchaseCode: 'code' }), 'rejected');
});

test('registry failures propagate instead of authorizing or creating a pending record', async (context) => {
  const find = registry(context, null);
  const failure = new Error('registry unavailable');
  find.mock.mockImplementation(() => ({ select: async () => { throw failure; } }));
  await assert.rejects(validateStudent('maria@example.com'), (error) => error === failure);
});

test('registry index initialization failures propagate without trusting evidence', async (context) => {
  const original = config.studentValidation.source;
  config.studentValidation.source = 'mongodb';
  context.after(() => { config.studentValidation.source = original; });
  const failure = new Error('index initialization failed');
  context.mock.method(StudentAuthorization, 'init', async () => { throw failure; });
  const find = context.mock.method(StudentAuthorization, 'findOne', () => assert.fail('must not query incomplete registry'));
  await assert.rejects(validateStudent('maria@example.com', { trustedIdentifier: 'proof' }), (error) => error === failure);
  assert.equal(find.mock.callCount(), 0);
});

test('maps duplicate trusted proofs in registry indexes to internal configuration failure', async (context) => {
  const original = config.studentValidation.source;
  config.studentValidation.source = 'mongodb';
  context.after(() => { config.studentValidation.source = original; });
  const failure = Object.assign(new Error('duplicate trusted proof'), { code: 11000 });
  context.mock.method(StudentAuthorization, 'init', async () => { throw failure; });
  await assert.rejects(validateStudent('maria@example.com'), {
    statusCode: 500, message: 'Base autorizada de alunos inconsistente',
  });
});

test('authorization records default to pending and hide proof hashes from normal queries', () => {
  const record = new StudentAuthorization({ email: ' MARIA@Example.COM ' });
  assert.equal(record.status, 'pending');
  assert.equal(record.email, 'maria@example.com');
  assert.equal(StudentAuthorization.schema.path('purchaseCodeHash').options.select, false);
  assert.equal(StudentAuthorization.schema.path('purchaseCodeHash').options.unique, true);
  assert.equal(StudentAuthorization.schema.path('purchaseCodeHash').options.sparse, true);
  assert.equal(StudentAuthorization.schema.path('trustedIdentifierHash').options.select, false);
  assert.equal(StudentAuthorization.schema.path('trustedIdentifierHash').options.unique, true);
  assert.equal(StudentAuthorization.schema.path('trustedIdentifierHash').options.sparse, true);
  assert.ok(new StudentAuthorization({ email: 'invalid' }).validateSync().errors.email);
});
