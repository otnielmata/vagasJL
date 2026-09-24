const assert = require('node:assert/strict');
const { test } = require('node:test');
const rules = require('../../src/middleware/candidate-opportunity-availability.middleware');
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

test('accepts strict true and false choices', async () => {
  assert.equal((await check({ availableForOpportunities: true })).continued, true);
  assert.equal((await check({ availableForOpportunities: false })).continued, true);
});

for (const body of [undefined, null, {}, [], 'false',
  { availableForOpportunities: 'false' },
  { availableForOpportunities: 0 },
  { availableForOpportunities: false, candidateId: '6512f1e2b3a1c2d3e4f5a6b6' },
  { availability: false }]) {
  test(`rejects invalid opportunity availability ${JSON.stringify(body)}`, async () => {
    const result = await check(body);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
  });
}
