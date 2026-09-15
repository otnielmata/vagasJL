const assert = require('node:assert/strict');
const { test } = require('node:test');
const candidateReadRules = require('../../src/middleware/candidate-read.middleware');
const validate = require('../../src/middleware/validate.middleware');

async function validateId(id) {
  const request = { params: { id } };
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  for (const rule of candidateReadRules()) await rule.run(request);
  validate(request, response, () => { continued = true; }, 400);
  return { response, continued };
}

test('accepts valid lowercase and uppercase candidate ObjectId', async () => {
  for (const id of ['6512f1e2b3a1c2d3e4f5a6b7', '6512F1E2B3A1C2D3E4F5A6B7']) {
    assert.equal((await validateId(id)).continued, true);
  }
});

for (const id of [undefined, '', 'invalid', '123456789012', 'g'.repeat(24)]) {
  test(`rejects malformed candidate identifier: ${JSON.stringify(id)}`, async () => {
    const result = await validateId(id);
    assert.equal(result.continued, false);
    assert.equal(result.response.statusCode, 400);
    assert.deepEqual(result.response.body.errors, [
      { field: 'id', message: 'Identificador de candidato invalido' },
    ]);
  });
}
