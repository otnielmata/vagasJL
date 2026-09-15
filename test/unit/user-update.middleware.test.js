const assert = require('node:assert/strict');
const { test } = require('node:test');
const userUpdateRules = require('../../src/middleware/user-update.middleware');
const validate = require('../../src/middleware/validate.middleware');

const userId = '6512f1e2b3a1c2d3e4f5a6b7';

async function validateInput(body, id = userId) {
  const request = { params: { id }, body };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of userUpdateRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { request, response, continued };
}

test('accepts partial updates and normalizes name and email without changing password', async () => {
  for (const input of [{ name: 'Maria' }, { email: 'maria@example.com' }, { password: '12345678' }]) {
    assert.equal((await validateInput(input)).continued, true);
  }
  const result = await validateInput({ name: ' Maria ', email: ' MARIA@Example.COM ', password: ' 12345678 ' });
  assert.equal(result.continued, true);
  assert.deepEqual(result.request.body, { name: 'Maria', email: 'maria@example.com', password: ' 12345678 ' });
});

for (const body of [
  undefined, null, {}, [], 'invalid', { name: '' }, { name: '   ' }, { name: null }, { name: 123 },
  { email: null }, { email: 'invalid' }, { email: ['maria@example.com'] },
  { password: null }, { password: '1234567' }, { password: 12345678 }, { password: {} },
  { password: 'é'.repeat(37) }, { password: '😀'.repeat(7) },
  { name: 'Maria', _id: userId }, { id: userId }, { role: 'admin' }, { status: 'inactive' },
  { createdAt: '2026-01-01' }, { updatedAt: '2026-01-01' }, { __v: 0 },
  { $set: { name: 'Maria' } }, { 'email.value': 'maria@example.com' },
]) {
  test(`rejects invalid or non-editable input: ${JSON.stringify(body)}`, async () => {
    const result = await validateInput(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.length > 0);
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}

test('rejects malformed identifier with 400', async () => {
  for (const id of ['invalid', '123456789012', 'z'.repeat(24)]) {
    const result = await validateInput({ name: 'Maria' }, id);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.some((error) => error.field === 'id'));
  }
});

test('accepts uppercase ObjectId and 72-byte password boundary', async () => {
  assert.equal((await validateInput({ password: 'é'.repeat(36) }, userId.toUpperCase())).continued, true);
});
