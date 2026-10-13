require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const router = require('../../src/routes/vacancy.routes');
const controller = require('../../src/controllers/vacancy.controller');
const service = require('../../src/services/company-candidate-report.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('candidate report route is protected for recruiters and administrators', () => {
  const route = router.stack.find((layer) =>
    layer.route?.path === '/:id/candidatos/:candidateId/relatorio').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.showCandidateReport);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, response, () => assert.fail('unauthenticated'));
  assert.equal(response.code, 401);
  handlers[1]({ user: { role: 'candidate' } }, response, () => assert.fail('forbidden'));
  assert.equal(response.code, 403);
});

test('controller returns report and forwards failures', async (context) => {
  const report = { candidate: { name: 'Julio' }, match: { percentage: 44 } };
  const call = context.mock.method(service, 'getCompanyCandidateReport', async () => report);
  const req = { user: { id: 'actor', role: 'admin' },
    params: { id: 'vacancy', candidateId: 'candidate' } };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.showCandidateReport(req, response, () => assert.fail('unexpected error'));
  assert.equal(response.code, 200);
  assert.deepEqual(response.body, report);
  assert.deepEqual(call.mock.calls[0].arguments, [req.user, 'vacancy', 'candidate']);
  call.mock.mockImplementation(async () => { throw new Error('db'); });
  await controller.showCandidateReport(req, response, (error) => assert.equal(error.message, 'db'));
});
