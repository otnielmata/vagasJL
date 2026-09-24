const assert = require('node:assert/strict');
const { test } = require('node:test');
const rules = require('../../src/middleware/candidate-public-profile.middleware');
const validate = require('../../src/middleware/validate.middleware');

async function check(body) {
  const request = { body };
  const response = { status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  let continued = false;
  for (const rule of rules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { response, continued };
}

test('accepts opt-in with selected fields and explicit revocation', async () => {
  assert.equal((await check({ enabled: true, fields: [
    'name', 'matchProfile.apiTesting', 'formation.projects',
  ] })).continued, true);
  assert.equal((await check({ enabled: false })).continued, true);
  assert.equal((await check({ enabled: false, fields: [] })).continued, true);
});

for (const body of [
  undefined,
  {},
  { enabled: 'true', fields: ['name'] },
  { enabled: true },
  { enabled: true, fields: [] },
  { enabled: true, fields: ['email'] },
  { enabled: true, fields: ['phone'] },
  { enabled: true, fields: ['name', 'name'] },
  { enabled: false, fields: ['name'] },
  { enabled: false, fields: 'name' },
  { enabled: true, fields: ['name'], slug: 'maria' },
]) {
  test(`rejects invalid public profile payload ${JSON.stringify(body)}`, async () => {
    const result = await check(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  });
}
