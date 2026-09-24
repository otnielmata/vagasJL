require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/admin-vacancy.service');
const controller = require('../../src/controllers/admin-vacancy.controller');

test('controller returns 201 for creation and 200 for idempotent review', async (context) => {
  const vacancy = { toJSON: () => ({ _id: 'vacancy', origin: 'ADMIN', status: 'pending' }) };
  const manage = context.mock.method(service, 'manageAdminVacancy', async () => ({
    vacancy, created: true, changed: true,
  }));
  const request = { user: { id: 'admin', role: 'admin' }, params: { id: 'vacancy' }, body: {} };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await controller.manage(request, response, assert.fail);
  assert.deepEqual(manage.mock.calls[0].arguments, [request.user, 'vacancy', request.body]);
  assert.equal(response.code, 201);
  assert.equal(response.body.created, true);

  manage.mock.mockImplementation(async () => ({ vacancy, created: false, changed: false }));
  await controller.manage(request, response, assert.fail);
  assert.equal(response.code, 200);
  assert.equal(response.body.changed, false);
});

test('controller forwards administration failures', async (context) => {
  const failure = new Error('falha');
  context.mock.method(service, 'manageAdminVacancy', async () => { throw failure; });
  let forwarded;
  await controller.manage({ user: {}, params: {}, body: {} }, {},
    (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
