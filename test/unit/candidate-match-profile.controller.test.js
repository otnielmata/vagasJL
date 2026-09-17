require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const app = require('../../src/app');
const router = require('../../src/routes/candidate.routes');
const controller = require('../../src/controllers/candidate-match-profile.controller');
const service = require('../../src/services/candidate-match-profile.service');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

test('route is mounted and authenticates candidates before storage', () => {
  assert.ok(app._router.stack.some((layer) => layer.regexp.test('/candidatos/me/perfil-match')));
  const route = router.stack.find((layer) => layer.route?.path === '/me/perfil-match').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.register);

  const unauthenticated = { status(code) { this.code = code; return this; }, json() {} };
  handlers[0]({ headers: {} }, unauthenticated, () => assert.fail('missing token must stop'));
  assert.equal(unauthenticated.code, 401);
  const denied = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'company' } }, denied, () => assert.fail('company must stop'));
  assert.equal(denied.code, 403);
});

test('controller returns 201 with safe profile and authenticated identity', async (context) => {
  const registration = context.mock.method(service, 'registerMatchProfile', async () => ({
    toJSON: () => ({ _id: 'profile', candidate: 'candidate', values: { yearsOfExperience: 2 } }),
  }));
  const req = { user: { id: 'owner', role: 'candidate' }, body: { values: { yearsOfExperience: 2 } } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.register(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.code, 201);
  assert.deepEqual(res.body.profile.values, { yearsOfExperience: 2 });
  assert.deepEqual(registration.mock.calls[0].arguments, [req.user, req.body]);
});

test('controller forwards registration error without success', async (context) => {
  const failure = new Error('rejected');
  context.mock.method(service, 'registerMatchProfile', async () => { throw failure; });
  let forwarded;
  await controller.register({ user: { id: 'owner', role: 'candidate' }, body: {} }, {},
    (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test('PATCH route reuses candidate authentication and owner-only controller', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/me/perfil-match' && layer.route.methods.patch).route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.update);
  const denied = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'company' } }, denied, () => assert.fail('company must stop'));
  assert.equal(denied.code, 403);
});

test('update returns 200, new ETag and eligibility only for active candidate', async (context) => {
  const edit = context.mock.method(service, 'updateMatchProfile', async () => ({
    profile: { revision: 3, toJSON: () => ({ revision: 3, values: { agile: ['scrum'] } }) },
    candidateStatus: 'active',
  }));
  const req = { user: { id: 'owner', role: 'candidate' }, body: { values: { agile: 'scrum' } },
    get: () => '"2"' };
  const res = { set(name, value) { this[name] = value; return this; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.update(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.code, 200);
  assert.equal(res.ETag, '"3"');
  assert.equal(res.body.profile.matchEligible, true);
  assert.deepEqual(edit.mock.calls[0].arguments, [req.user, req.body, '"2"']);
  edit.mock.mockImplementation(async () => ({
    profile: { revision: 4, toJSON: () => ({ revision: 4, values: { agile: ['scrum'] } }) },
    candidateStatus: 'pending_validation',
  }));
  await controller.update(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.body.profile.matchEligible, false);
  edit.mock.mockImplementation(async () => ({
    profile: { revision: 5, toJSON: () => ({ revision: 5, values: {} }) },
    candidateStatus: 'active',
  }));
  await controller.update(req, res, () => assert.fail('unexpected error'));
  assert.equal(res.body.profile.matchEligible, false);
});

test('update forwards error without reporting success', async (context) => {
  const failure = new Error('storage unavailable');
  context.mock.method(service, 'updateMatchProfile', async () => { throw failure; });
  let forwarded;
  await controller.update({ user: { id: 'owner', role: 'candidate' }, body: {}, get: () => '"1"' }, {},
    (error) => { forwarded = error; });
  assert.equal(forwarded, failure);
});
