const assert = require('node:assert/strict');
const { test } = require('node:test');
const candidateRules = require('../../src/middleware/candidate.middleware');
const validate = require('../../src/middleware/validate.middleware');
const input = { name: 'Maria', email: 'maria@example.com' };

async function check(body) {
  const request = { body };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of candidateRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { request, response, continued };
}

test('accepts minimal data, null optional fields and UNKNOWN without converting to false', async () => {
  for (const fields of [{}, { phone: null, availability: null }, { photoUrl: 'UNKNOWN', availability: 'UNKNOWN' }]) {
    assert.equal((await check({ ...input, ...fields })).continued, true);
  }
});

test('normalizes identity fields and accepts valid optional data', async () => {
  const result = await check({ name: ' Maria ', email: ' MARIA@Example.COM ', phone: '+55 11 99999-9999', photoUrl: 'https://example.com/a.png', availability: 'available', purchaseCode: 'code' });
  assert.equal(result.continued, true);
  assert.equal(result.request.body.email, input.email);
  assert.equal(result.request.body.name, input.name);
});

for (const body of [undefined, null, {}, [], { email: input.email }, { name: input.name },
  { ...input, name: '' }, { ...input, name: 123 }, { ...input, email: 'invalid' },
  { ...input, availability: false }, { ...input, city: false }, { ...input, city: '' },
  { ...input, phone: 'not-phone' }, { ...input, photoUrl: 'javascript:alert(1)' },
  { ...input, linkedinUrl: 'invalid' }, { ...input, portfolioUrl: 'ftp://example.com' },
  { ...input, professionalSummary: 'a'.repeat(5001) }, { ...input, purchaseCode: null },
  { ...input, purchaseCode: '' }, { ...input, status: 'active' }, { ...input, user: 'someone' },
  { ...input, studentVerified: true }, { ...input, visibleToCompanies: true },
]) {
  test(`rejects invalid candidate input ${JSON.stringify(body)?.slice(0, 110)}`, async () => {
    const result = await check(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}
