require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const routes = require('../../src/routes/vacancy.routes');
const controller = require('../../src/controllers/vacancy.controller');
const service = require('../../src/services/vacancy-requirements.service');

test('requirements route authenticates and authorizes before the controller', () => {
  const layer = routes.stack.find((entry) => entry.route?.path === '/:id/requisitos');
  assert.ok(layer);
  assert.equal(layer.route.methods.patch, true);
  assert.equal(layer.route.stack.length, 4);
  assert.equal(layer.route.stack[3].handle, controller.updateRequirements);
});

test('requirements controller returns updated vacancy and forwards errors', async (context) => {
  const vacancy = { toJSON: () => ({ _id: 'vacancy', requirementsRevision: 1 }) };
  const call = context.mock.method(service, 'updateRequirements', async () => vacancy);
  const req = { user: { id: 'actor', role: 'admin' }, params: { id: 'vacancy' },
    body: { requirements: [], reason: 'Review' } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let forwarded;
  await controller.updateRequirements(req, res, (error) => { forwarded = error; });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { vacancy: vacancy.toJSON() });
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.params.id, req.body]);
  call.mock.mockImplementation(async () => { throw new Error('database'); });
  await controller.updateRequirements(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded.message, 'database');
});
