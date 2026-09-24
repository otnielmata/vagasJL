const assert = require('node:assert/strict');
const { test } = require('node:test');
const rules = require('../../src/middleware/candidate-display-permissions.middleware');
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

test('accepts granular categories and an empty object to revoke all', async () => {
  assert.equal((await check({ contact: ['linkedinUrl'], formation: ['cohort'] })).continued, true);
  assert.equal((await check({ contact: [] })).continued, true);
  assert.equal((await check({})).continued, true);
});

for (const body of [undefined, null, [], 'contact', { contact: 'email' },
  { contact: ['email', 'email'] }, { contact: ['password'] },
  { formation: ['privateEmail'] }, { contact: [], candidateId: 'candidate' }]) {
  test(`rejects invalid display permissions ${JSON.stringify(body)}`, async () => {
    const result = await check(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  });
}
