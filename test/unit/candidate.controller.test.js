require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const candidateService = require('../../src/services/candidate.service');
const candidateController = require('../../src/controllers/candidate.controller');
const Candidate = require('../../src/models/candidate.model');
const ApiError = require('../../src/errors/api.error');
const router = require('../../src/routes/candidate.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('registration route authenticates before validation, storage and controller', () => {
  const route = router.stack.find((layer) => layer.route?.methods.post).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 1);
  assert.equal(handlers.at(-1), candidateController.register);
});

test('returns 201 using the token owner and hides purchase proof', async (context) => {
  const candidate = new Candidate({ user: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria', email: 'maria@example.com' });
  const register = context.mock.method(candidateService, 'registerCandidate', async () => candidate);
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const body = { name: 'Maria', email: 'maria@example.com', purchaseCode: 'private-proof' };
  await candidateController.register({ user: { id: candidate.user.toString() }, body }, response, () => assert.fail('unexpected error'));
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.candidate.status, 'pending_validation');
  assert.equal(response.body.candidate.visibleToCompanies, false);
  assert.equal(JSON.stringify(response.body).includes('private-proof'), false);
  assert.deepEqual(register.mock.calls[0].arguments, [candidate.user.toString(), body]);
});

for (const statusCode of [400, 401, 409, 422]) {
  test(`forwards candidate error ${statusCode} without success`, async (context) => {
    const failure = new ApiError(statusCode, 'Cadastro rejeitado');
    context.mock.method(candidateService, 'registerCandidate', async () => { throw failure; });
    let forwarded;
    await candidateController.register({ user: { id: 'owner' }, body: {} }, {}, (error) => { forwarded = error; });
    assert.equal(forwarded, failure);
  });
}
