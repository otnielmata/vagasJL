require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validationResult } = require('express-validator');
const candidateDeleteRules = require('../../src/middleware/candidate-delete.middleware');
const candidateController = require('../../src/controllers/candidate.controller');
const router = require('../../src/routes/candidate.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

async function validateId(id) {
  const request = { params: { id } };
  for (const rule of candidateDeleteRules()) await rule.run(request);
  return validationResult(request);
}

for (const id of ['6512f1e2b3a1c2d3e4f5a6b7', '6512F1E2B3A1C2D3E4F5A6B7']) {
  test(`accepts valid candidate deletion id ${id}`, async () => {
    assert.equal((await validateId(id)).isEmpty(), true);
  });
}

for (const id of [undefined, '', 'invalid', '123456789012', 'g'.repeat(24)]) {
  test(`rejects malformed candidate deletion id ${JSON.stringify(id)}`, async () => {
    const errors = (await validateId(id)).array();
    assert.deepEqual(errors.map(({ path, msg }) => ({ path, msg })), [
      { path: 'id', msg: 'Identificador de candidato invalido' },
    ]);
  });
}

test('delete route authenticates and permits only candidates before storage', () => {
  const route = router.stack.find((layer) =>
    layer.route?.path === '/:id' && layer.route.methods.delete).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 2);
  assert.equal(handlers.at(-1), candidateController.remove);

  const unauthenticated = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  handlers[0]({ headers: {} }, unauthenticated, () => assert.fail('missing token must be denied'));
  assert.equal(unauthenticated.statusCode, 401);

  let continued = false;
  handlers[1]({ user: { role: 'candidate' } }, {}, () => { continued = true; });
  assert.equal(continued, true);

  for (const role of ['company', 'admin']) {
    const denied = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    handlers[1]({ user: { role } }, denied, () => assert.fail(`${role} must be denied`));
    assert.equal(denied.statusCode, 403);
  }
});
