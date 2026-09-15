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
  const route = router.stack.find((layer) => layer.route?.path === '/' && layer.route.methods.post).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  const authorizationResponse = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  handlers[1]({ user: { role: 'company' } }, authorizationResponse,
    () => assert.fail('company must not reach candidate registration'));
  assert.equal(authorizationResponse.statusCode, 403);
  let candidateAuthorized = false;
  handlers[1]({ user: { role: 'candidate' } }, {}, () => { candidateAuthorized = true; });
  assert.equal(candidateAuthorized, true);
  assert.ok(handlers.indexOf(ensureDatabase) > 1);
  assert.equal(handlers.at(-1), candidateController.register);
});

test('eligibility route authenticates, restricts candidate role and validates before storage', () => {
  const route = router.stack.find((layer) =>
    layer.route?.path === '/:id/validacao' && layer.route.methods.post).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 2);
  assert.equal(handlers.at(-1), candidateController.validateEligibility);

  const unauthenticated = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
  handlers[0]({ headers: {} }, unauthenticated, () => assert.fail('missing token must be denied'));
  assert.equal(unauthenticated.statusCode, 401);

  const denied = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  handlers[1]({ user: { role: 'company' } }, denied, () => assert.fail('company must be denied'));
  assert.equal(denied.statusCode, 403);

  let continued = false;
  handlers[1]({ user: { role: 'candidate' } }, {}, () => { continued = true; });
  assert.equal(continued, true);
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

for (const statusCode of [200, 202]) {
  test(`eligibility controller returns ${statusCode} for the authenticated owner without proof leakage`, async (context) => {
    const candidate = new Candidate({
      user: '6512f1e2b3a1c2d3e4f5a6b7',
      name: 'Maria',
      email: 'maria@example.com',
      eligibility: {
        status: statusCode === 200 ? 'approved' : 'pending',
        method: 'purchase_code',
        source: 'mongodb',
        lastAttemptAt: new Date(),
        approvedAt: statusCode === 200 ? new Date() : null,
      },
    });
    const service = context.mock.method(candidateService, 'validateCandidateEligibility', async () => ({
      candidate, statusCode,
    }));
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const request = {
      params: { id: candidate.id },
      user: { id: candidate.user.toString() },
      body: { purchaseCode: 'private-proof' },
    };
    await candidateController.validateEligibility(request, response, () => assert.fail('unexpected error'));
    assert.equal(response.statusCode, statusCode);
    assert.equal(response.body.candidate.eligibility.source, undefined);
    assert.equal(JSON.stringify(response.body).includes('private-proof'), false);
    assert.deepEqual(service.mock.calls[0].arguments, [request.params.id, request.user.id, request.body]);
  });
}

for (const statusCode of [400, 403, 404, 409, 422, 503]) {
  test(`eligibility controller forwards ${statusCode} without a success response`, async (context) => {
    const failure = new ApiError(statusCode, 'Validacao rejeitada');
    context.mock.method(candidateService, 'validateCandidateEligibility', async () => { throw failure; });
    let forwarded;
    await candidateController.validateEligibility(
      { params: { id: 'candidate' }, user: { id: 'owner' }, body: {} },
      {},
      (error) => { forwarded = error; }
    );
    assert.equal(forwarded, failure);
  });
}
