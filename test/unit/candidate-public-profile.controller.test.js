require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate-public-profile.controller');
const service = require('../../src/services/candidate-public-profile.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('exposes exactly one protected write endpoint and no public read endpoint', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/me/perfil-publico');
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { patch: true });
  const handlers = layer.route.stack.map((entry) => entry.handle);
  assert.equal(handlers[0], authenticate);
  assert.ok(handlers.indexOf(ensureDatabase) > 2);
  assert.equal(handlers.at(-1), controller.update);
  assert.equal(routes.stack.some((entry) => entry.route?.path.includes('perfil-publico') &&
    (entry.route.methods.get || entry.route.methods.post || entry.route.methods.delete)), false);
});

test('controller updates consent for the authenticated candidate and forwards errors', async (context) => {
  const publicProfile = { enabled: true, fields: ['name'], effectiveFields: ['name'] };
  const call = context.mock.method(service, 'updateOwnPublicProfile', async () => publicProfile);
  const req = { user: { id: ownerId, role: 'candidate' }, body: { enabled: true, fields: ['name'] } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.update(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { publicProfile });
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.body]);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.update(req, response, (error) => assert.equal(error.message, 'db'));
});

const ownerId = '6512f1e2b3a1c2d3e4f5a6b7';
