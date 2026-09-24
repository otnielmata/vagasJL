require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const controller = require('../../src/controllers/candidate.controller');
const service = require('../../src/services/candidate-application.service');

test('application controller returns the safe referral and forwards errors', async (context) => {
  const application = { state: 'redirect_ready', applicationConfirmed: false };
  const call = context.mock.method(service, 'referCandidateToApplication', async () => application);
  const req = { user: { id: 'candidate', role: 'candidate' }, params: { id: 'vacancy' } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.referToApplication(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, { application });
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, req.params.id]);
  call.mock.mockImplementation(async () => { throw new Error('database'); });
  await controller.referToApplication(req, response, (error) => assert.equal(error.message, 'database'));
});
