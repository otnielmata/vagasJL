const assert = require('node:assert/strict');
const { test } = require('node:test');
const candidateValidationRules = require('../../src/middleware/candidate-validation.middleware');
const validate = require('../../src/middleware/validate.middleware');

const candidateId = '6512f1e2b3a1c2d3e4f5a6b6';

async function check(id, body, includeBody = true) {
  const request = { params: { id } };
  if (includeBody) request.body = body;
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let continued = false;
  for (const rule of candidateValidationRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { request, response, continued };
}

test('accepts normalized email validation without a request body or evidence', async () => {
  assert.equal((await check(candidateId, undefined, false)).continued, true);
  assert.equal((await check(candidateId, {})).continued, true);
});

test('accepts either trusted proof and preserves its exact secret value', async () => {
  for (const body of [
    { purchaseCode: ' code with spaces ' },
    { trustedIdentifier: ' trusted-student-id ' },
    { purchaseCode: 'code', trustedIdentifier: 'student-id' },
  ]) {
    const result = await check(candidateId.toUpperCase(), body);
    assert.equal(result.continued, true);
    assert.deepEqual(result.request.body, body);
  }
});

for (const [id, body] of [
  [undefined, {}],
  ['', {}],
  ['invalid', {}],
  ['123456789012', {}],
  ['gggggggggggggggggggggggg', {}],
  [candidateId, null],
  [candidateId, []],
  [candidateId, 'proof'],
  [candidateId, { purchaseCode: null }],
  [candidateId, { purchaseCode: '' }],
  [candidateId, { purchaseCode: '   ' }],
  [candidateId, { purchaseCode: 123 }],
  [candidateId, { purchaseCode: 'a'.repeat(257) }],
  [candidateId, { trustedIdentifier: null }],
  [candidateId, { trustedIdentifier: '' }],
  [candidateId, { trustedIdentifier: {} }],
  [candidateId, { trustedIdentifier: 'a'.repeat(257) }],
  [candidateId, { email: 'other@example.com' }],
  [candidateId, { status: 'active' }],
  [candidateId, { approved: true }],
  [candidateId, { source: 'client' }],
  [candidateId, { eligibility: { status: 'approved' } }],
  [candidateId, { method: 'email' }],
  [candidateId, { user: candidateId }],
]) {
  test(`rejects malformed validation input ${JSON.stringify({ id, body })?.slice(0, 120)}`, async () => {
    const result = await check(id, body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.ok(result.response.body.errors.every((error) => !('value' in error)));
  });
}
