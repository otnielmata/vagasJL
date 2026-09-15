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

test('verifies purchase code only against the hash bound to the authenticated email', async (context) => {
  const purchaseCode = 'trusted-purchase-code';
  const find = registry(context, { status: 'authorized', purchaseCodeHash: createHash('sha256').update(purchaseCode).digest('hex') });
  assert.equal(await validateStudent('maria@example.com', purchaseCode), 'verified');
  assert.equal(await validateStudent('maria@example.com', 'wrong-code'), 'rejected');
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: 'maria@example.com' }]);
});

test('missing or malformed stored proof cannot validate a submitted code', async (context) => {
  registry(context, { status: 'authorized', purchaseCodeHash: 'bad-hash' });
  assert.equal(await validateStudent('maria@example.com', 'code'), 'rejected');
});

test('registry failures propagate instead of authorizing or creating a pending record', async (context) => {
  const find = registry(context, null);
  const failure = new Error('registry unavailable');
  find.mock.mockImplementation(() => ({ select: async () => { throw failure; } }));
  await assert.rejects(validateStudent('maria@example.com'), (error) => error === failure);
});

test('authorization records default to pending and hide proof hashes from normal queries', () => {
  const record = new StudentAuthorization({ email: ' MARIA@Example.COM ' });
  assert.equal(record.status, 'pending');
  assert.equal(record.email, 'maria@example.com');
  assert.equal(StudentAuthorization.schema.path('purchaseCodeHash').options.select, false);
});
