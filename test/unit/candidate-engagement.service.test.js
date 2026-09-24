require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const engagementClient = require('../../src/services/engagement-client.service');
const { getOwnEngagement } = require('../../src/services/candidate-engagement.service');

const actor = { id: '6512f1e2b3a1c2d3e4f5a6b7', role: 'candidate' };

function setup(context, candidate = { _id: 'candidate', email: 'student@example.com' }) {
  const query = { select: async () => candidate };
  const findOne = context.mock.method(Candidate, 'findOne', () => query);
  const origin = context.mock.method(engagementClient, 'fetchOfficialEngagement', async () => ({
    status: 'available', readOnly: true, data: { cohort: 'A' }, referenceAt: null,
  }));
  return { findOne, origin, query };
}

test('uses only active validated candidate email as trusted origin identifier', async (context) => {
  const { findOne, origin } = setup(context);
  const result = await getOwnEngagement(actor);
  assert.equal(result.status, 'available');
  assert.deepEqual(findOne.mock.calls[0].arguments[0], { user: actor.id, status: 'active',
    'eligibility.status': 'approved', deletedAt: null });
  assert.deepEqual(origin.mock.calls[0].arguments, ['student@example.com']);
});

test('rejects caller supplied student identifiers before database or origin access', async (context) => {
  const { findOne, origin } = setup(context);
  await assert.rejects(getOwnEngagement(actor, { studentId: 'another-student' }), { statusCode: 400 });
  assert.equal(findOne.mock.callCount(), 0);
  assert.equal(origin.mock.callCount(), 0);
});

test('requires candidate role and active validated link without calling origin', async (context) => {
  const { origin, query } = setup(context);
  await assert.rejects(getOwnEngagement({ role: 'company' }), { statusCode: 403 });
  query.select = async () => null;
  await assert.rejects(getOwnEngagement(actor), { statusCode: 403 });
  assert.equal(origin.mock.callCount(), 0);
});
