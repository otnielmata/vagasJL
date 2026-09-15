const assert = require('node:assert/strict');
const { test } = require('node:test');
const loginRules = require('../../src/middleware/login.middleware');
const validate = require('../../src/middleware/validate.middleware');

const credentials = { email: 'maria@example.com', password: 'senhaForte123' };

async function validateInput(body, statusCode = 400) {
  const request = { body };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of loginRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, statusCode);
  return { request, response, continued };
}

test('normalizes email and preserves password exactly as supplied', async () => {
  const result = await validateInput({ email: ' MARIA@Example.COM ', password: ' senha com espacos ' });
  assert.equal(result.continued, true);
  assert.equal(result.request.body.email, 'maria@example.com');
  assert.equal(result.request.body.password, ' senha com espacos ');
  assert.equal(result.response.statusCode, undefined);
});

for (const [field, value] of [
  ['email', undefined], ['email', null], ['email', ''], ['email', '   '],
  ['email', 'invalid'], ['email', {}], ['email', ['maria@example.com']], ['email', 123],
  ['password', undefined], ['password', null], ['password', ''], ['password', 12345678],
  ['password', {}], ['password', ['senhaForte123']], ['password', 'a'.repeat(73)],
  ['password', 'é'.repeat(37)],
]) {
  test(`rejects invalid login ${field}: ${JSON.stringify(value)}`, async () => {
    const result = await validateInput({ ...credentials, [field]: value });
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.some((error) => error.field === field));
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}

test('rejects an absent body with 400 and both required fields', async () => {
  const result = await validateInput(undefined);
  assert.equal(result.continued, false);
  assert.equal(result.response.statusCode, 400);
  assert.deepEqual(result.response.body.errors.map((error) => error.field), ['email', 'password']);
});

test('accepts legacy short passwords and the bcrypt 72-byte boundary', async () => {
  for (const password of ['123456', 'é'.repeat(36)]) {
    assert.equal((await validateInput({ ...credentials, password })).continued, true);
  }
});

test('existing auth login keeps 422 for invalid fields', async () => {
  const result = await validateInput({}, 422);
  assert.equal(result.continued, false);
  assert.equal(result.response.statusCode, 422);
});
