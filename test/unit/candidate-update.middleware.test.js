const assert = require('node:assert/strict');
const { test } = require('node:test');
const candidateUpdateRules = require('../../src/middleware/candidate-update.middleware');
const validate = require('../../src/middleware/validate.middleware');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';

async function check(id, body) {
  const request = { params: { id }, body };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of candidateUpdateRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { request, response, continued };
}

test('accepts partial fields and normalizes strings and email', async () => {
  const result = await check(candidateId.toUpperCase(), {
    name: ' Maria Silva ',
    email: ' MARIA.NOVA@Example.COM ',
    phone: ' +55 11 99999-9999 ',
    city: ' Sao Paulo ',
  });
  assert.equal(result.continued, true);
  assert.deepEqual(result.request.body, {
    name: 'Maria Silva',
    email: 'maria.nova@example.com',
    phone: '+55 11 99999-9999',
    city: 'Sao Paulo',
  });
});

test('accepts every editable profile field, UNKNOWN and null as explicit missing data', async () => {
  const result = await check(candidateId, {
    photoUrl: null,
    phone: 'UNKNOWN',
    city: null,
    state: 'SP',
    country: 'Brasil',
    linkedinUrl: 'UNKNOWN',
    githubUrl: 'https://github.com/maria',
    portfolioUrl: null,
    professionalSummary: 'Profissional de testes',
    availability: null,
  });
  assert.equal(result.continued, true);
});

for (const [id, body] of [
  [undefined, { city: 'Sao Paulo' }],
  ['', { city: 'Sao Paulo' }],
  ['invalid', { city: 'Sao Paulo' }],
  ['123456789012', { city: 'Sao Paulo' }],
  ['g'.repeat(24), { city: 'Sao Paulo' }],
  [candidateId, undefined],
  [candidateId, null],
  [candidateId, {}],
  [candidateId, []],
  [candidateId, 'city'],
  [candidateId, { name: null }],
  [candidateId, { name: '' }],
  [candidateId, { name: 123 }],
  [candidateId, { email: null }],
  [candidateId, { email: 'invalid' }],
  [candidateId, { phone: false }],
  [candidateId, { city: false }],
  [candidateId, { city: '' }],
  [candidateId, { phone: 'not-phone' }],
  [candidateId, { availability: false }],
  [candidateId, { availability: 'sometimes' }],
  [candidateId, { photoUrl: 'javascript:alert(1)' }],
  [candidateId, { linkedinUrl: 'invalid' }],
  [candidateId, { portfolioUrl: 'ftp://example.com' }],
  [candidateId, { professionalSummary: 'a'.repeat(5001) }],
  [candidateId, { status: 'active' }],
  [candidateId, { user: candidateId }],
  [candidateId, { eligibility: { status: 'approved' } }],
  [candidateId, { eligibilityHistory: [] }],
  [candidateId, { visibleToCompanies: true }],
  [candidateId, { availableForOpportunities: true }],
  [candidateId, { createdAt: '2026-01-01' }],
  [candidateId, { updatedAt: '2026-01-01' }],
  [candidateId, { __v: 1 }],
]) {
  test(`rejects invalid candidate update ${JSON.stringify({ id, body })?.slice(0, 120)}`, async () => {
    const result = await check(id, body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}
