require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validationResult } = require('express-validator');
const userDeleteRules = require('../../src/middleware/user-delete.middleware');
const { authenticateDeletion } = require('../../src/middleware/auth.middleware');
const controller = require('../../src/controllers/user.controller');
const router = require('../../src/routes/registration.routes');

for (const id of ['6512f1e2b3a1c2d3e4f5a6b7', '6512F1E2B3A1C2D3E4F5A6B7']) {
  test(`accepts valid deletion id ${id} without a request body`, async () => {
    const request = { params: { id } };
    for (const rule of userDeleteRules()) await rule.run(request);
    assert.equal(validationResult(request).isEmpty(), true);
  });
}

for (const id of [undefined, '', 'invalid', '123456789012', 'g'.repeat(24)]) {
  test(`rejects invalid deletion id ${id}`, async () => {
    const request = { params: { id } };
    for (const rule of userDeleteRules()) await rule.run(request);
    assert.equal(validationResult(request).isEmpty(), false);
  });
}

test('delete route authenticates before validation and calls deletion controller last', () => {
  const route = router.stack.find((layer) => layer.route?.methods.delete).route;
  assert.equal(route.path, '/:id');
  assert.equal(route.stack[0].handle, authenticateDeletion);
  assert.equal(route.stack.at(-1).handle, controller.remove);
});

test('delete route returns 400 for invalid identifier without entering controller', async () => {
  const route = router.stack.find((layer) => layer.route?.methods.delete).route;
  const request = { params: { id: 'invalid' } };
  for (const rule of userDeleteRules()) await rule.run(request);
  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  route.stack.at(-2).handle(request, response, () => assert.fail('invalid input must not continue'));
  assert.equal(response.statusCode, 400);
});
