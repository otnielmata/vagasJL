require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate-display-permissions.controller');
const service = require('../../src/services/candidate-display-permissions.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('exposes one authenticated candidate-only permission endpoint', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/permissoes-exibicao');
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { patch: true });
  const handlers = layer.route.stack.map((entry) => entry.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 2);
  assert.equal(handlers.at(-1), controller.update);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'company' } }, response, () => assert.fail('company must be denied'));
  assert.equal(response.code, 403);
});

test('controller returns permissions and forwards failures', async (context) => {
  const permissions = { contact: ['linkedinUrl'], formation: [], changedAt: new Date() };
  const call = context.mock.method(service, 'updateOwnDisplayPermissions', async () => permissions);
  const request = { user: { id: 'owner', role: 'candidate' },
    body: { contact: ['linkedinUrl'] } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.update(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { permissions });
  assert.deepEqual(call.mock.calls[0].arguments, [request.user, request.body]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.update(request, response, (error) => assert.equal(error.message, 'db'));
});
