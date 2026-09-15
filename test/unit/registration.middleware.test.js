const assert = require('node:assert/strict');
const { test } = require('node:test');
const registrationRules = require('../../src/middleware/registration.middleware');
const validate = require('../../src/middleware/validate.middleware');

const validInput = { name: 'Maria Silva', email: 'maria@example.com', password: '12345678' };

async function validateInput(body, statusCode = 400) {
  const request = { body };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of registrationRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, statusCode);
  return { request, response, continued };
}

test('accepts eight-character password and normalizes name and email', async () => {
  const result = await validateInput({ ...validInput, name: ' Maria Silva ', email: ' MARIA@Example.COM ' });
  assert.equal(result.continued, true);
  assert.equal(result.response.statusCode, undefined);
  assert.equal(result.request.body.name, 'Maria Silva');
  assert.equal(result.request.body.email, 'maria@example.com');
  assert.equal(result.request.body.password, validInput.password);
});

for (const [field, value] of [
  ['name', undefined], ['name', null], ['name', '   '], ['name', {}], ['name', 123],
  ['email', undefined], ['email', null], ['email', 'invalid'], ['email', ['maria@example.com']],
  ['password', undefined], ['password', null], ['password', ''], ['password', '1234567'],
  ['password', 12345678], ['password', {}], ['password', '😀'.repeat(7)],
  ['password', 'a'.repeat(73)], ['password', 'é'.repeat(37)],
  ['role', 'admin'], ['role', ['candidate']],
]) {
  test(`rejects invalid ${field}: ${JSON.stringify(value)}`, async () => {
    const result = await validateInput({ ...validInput, [field]: value });
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.some((error) => error.field === field));
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}

test('rejects missing body with 400', async () => {
  const result = await validateInput(undefined);
  assert.equal(result.response.statusCode, 400);
  assert.deepEqual(result.response.body.errors.map((error) => error.field).sort(), ['email', 'name', 'password']);
  assert.equal(result.continued, false);
});

test('accepts 72-byte passwords and public company role', async () => {
  const result = await validateInput({ ...validInput, password: 'é'.repeat(36), role: 'company' });
  assert.equal(result.continued, true);
});

test('keeps 422 validation status for the existing auth endpoint', async () => {
  const request = { body: {} };
  for (const rule of registrationRules()) await rule.run(request);
  const response = { status(code) { this.statusCode = code; return this; }, json() {} };
  validate(request, response, () => assert.fail('invalid input must not continue'));
  assert.equal(response.statusCode, 422);
});
