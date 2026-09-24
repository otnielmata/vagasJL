require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/candidate-status.service');
const controller = require('../../src/controllers/candidate-status.controller');

test('controller updates candidate status with authenticated administrator identity', async (context) => {
  const expected = { candidate: { _id: 'id', status: 'active' }, changed: true };
  const update = context.mock.method(service, 'updateCandidateStatus', async () => expected);
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'candidate' },
    body: { status: 'active', reason: 'Aprovado' } };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await controller.updateStatus(request, response, assert.fail);
  assert.deepEqual(update.mock.calls[0].arguments, [request.user, 'candidate', request.body]);
  assert.equal(response.code, 200);
  assert.equal(response.body, expected);
});

test('controller forwards candidate status errors', async (context) => {
  const failure = new Error('falha');
  context.mock.method(service, 'updateCandidateStatus', async () => { throw failure; });
  let forwarded;
  await controller.updateStatus({ user: {}, params: {}, body: {} }, {},
    (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
