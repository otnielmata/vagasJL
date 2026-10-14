require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const service = require('../../src/services/candidate-privacy-state.service');
const controller = require('../../src/controllers/candidate-privacy-state.controller');
const router = require('../../src/routes/candidate.routes');
const { authenticate } = require('../../src/middleware/auth.middleware');
const ensureDatabase = require('../../src/middleware/database.middleware');

const actor = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };

function candidate() {
  return {
    _id: '6512f1e2b3a1c2d3e4f5a6b8', user: { toString: () => actor.id }, status: 'active',
    eligibility: { status: 'approved' }, availableForOpportunities: true,
    opportunityAvailabilityChangedAt: new Date('2026-10-13T12:00:00Z'),
    enterpriseDisplayPermissions: { contact: ['email', 'phone'], formation: ['cohort'],
      changedAt: new Date('2026-10-13T12:01:00Z') },
    publicProfile: { enabled: true, fields: ['name', 'professionalSummary'],
      consentedAt: new Date('2026-10-13T12:02:00Z'), cacheVersion: 2 },
  };
}

test('candidate reads the privacy state persisted in MongoDB', async (context) => {
  const row = candidate();
  const select = context.mock.fn(async () => row);
  const find = context.mock.method(Candidate, 'findOne', () => ({ select }));
  const result = await service.getOwnPrivacyState(actor);
  assert.equal(result.availability.availableForOpportunities, true);
  assert.equal(result.availability.visibleToCompanies, true);
  assert.deepEqual(result.permissions.contact, ['email', 'phone']);
  assert.deepEqual(result.permissions.formation, ['cohort']);
  assert.equal(result.publicProfile.enabled, true);
  assert.deepEqual(result.publicProfile.fields, ['name', 'professionalSummary']);
  assert.deepEqual(find.mock.calls[0].arguments[0], { user: actor.id, deletedAt: null });
  assert.match(select.mock.calls[0].arguments[0], /\+enterpriseDisplayPermissions/);
  assert.match(select.mock.calls[0].arguments[0], /\+publicProfile/);
});

test('privacy state rejects other roles and missing candidates', async (context) => {
  const find = context.mock.method(Candidate, 'findOne', () => ({ select: async () => null }));
  await assert.rejects(service.getOwnPrivacyState({ ...actor, role: 'admin' }), { statusCode: 403 });
  await assert.rejects(service.getOwnPrivacyState(actor), { statusCode: 404 });
  assert.equal(find.mock.callCount(), 1);
});

test('GET /candidatos/me/privacidade authenticates candidate before database access', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/me/privacidade').route;
  const handlers = route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], authenticate);
  assert.equal(handlers[2], ensureDatabase);
  assert.equal(handlers[3], controller.show);
  const response = { status(code) { this.code = code; return this; }, json() {} };
  handlers[1]({ user: { role: 'admin' } }, response, () => assert.fail('must not continue'));
  assert.equal(response.code, 403);
});

test('privacy controller returns the persisted aggregate', async (context) => {
  const state = { availability: {}, permissions: {}, publicProfile: {} };
  const read = context.mock.method(service, 'getOwnPrivacyState', async () => state);
  const request = { user: actor };
  const response = { status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await controller.show(request, response, assert.fail);
  assert.equal(response.code, 200);
  assert.equal(response.body, state);
  assert.deepEqual(read.mock.calls[0].arguments, [actor]);
});
