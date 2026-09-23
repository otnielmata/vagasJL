require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const controller = require('../../src/controllers/company-status.controller');
const service = require('../../src/services/company-status.service');

test('company status controller returns service result and forwards errors', async (context) => {
  const expected = { company: { _id: 'company', status: 'active' },
    previousStatus: 'pending', changed: true, changedAt: new Date() };
  const update = context.mock.method(service, 'updateCompanyStatus', async () => expected);
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'company' },
    body: { status: 'active', reason: 'Aprovada' } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.updateStatus(request, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.equal(response.body, expected);
  assert.deepEqual(update.mock.calls[0].arguments, [request.user, request.params.id, request.body]);

  const failure = new Error('failure');
  update.mock.mockImplementation(async () => { throw failure; });
  let forwarded;
  await controller.updateStatus(request, {}, (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
