require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ApiError = require('../../src/errors/api.error');
const errorHandler = require('../../src/middleware/error.middleware');

for (const status of [400, 409]) {
  test(`renders registration error as ${status} with a safe message`, () => {
    const response = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    errorHandler(new ApiError(status, 'Cadastro rejeitado'), {}, response, () => assert.fail('unexpected delegation'));
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.body, { message: 'Cadastro rejeitado' });
  });
}

test('returns generic 401 for rejected login without credential details', () => {
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  errorHandler(new ApiError(401, 'Credenciais invalidas'), {}, response, () => assert.fail('unexpected delegation'));
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { message: 'Credenciais invalidas' });
});
