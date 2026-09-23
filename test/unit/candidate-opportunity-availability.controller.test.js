require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate-opportunity-availability.controller');
const service = require('../../src/services/candidate-opportunity-availability.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('exposes one authenticated self-service PATCH endpoint for candidates', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/disponibilidade');
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { patch: true });
  const handlers = layer.route.stack.map((entry) => entry.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 2);
  assert.equal(handlers.at(-1), controller.update);
  assert.equal(routes.stack.some((entry) => entry.route?.path === '/me/disponibilidade' &&
    (entry.route.methods.get || entry.route.methods.post || entry.route.methods.delete)), false);
});

test('controller returns the availability state and forwards failures', async (context) => {
  const availability = { availableForOpportunities: false, candidateStatus: 'active',
    visibleToCompanies: false };
  const call = context.mock.method(service, 'updateOwnOpportunityAvailability', async () => availability);
  const request = { user: { id: 'owner', role: 'candidate' },
    body: { availableForOpportunities: false } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.update(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { availability });
  assert.deepEqual(call.mock.calls[0].arguments, [request.user, request.body]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.update(request, response, (error) => assert.equal(error.message, 'db'));
});
