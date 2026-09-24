require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Configuration = require('../../src/models/match-engine-configuration.model');
const service = require('../../src/services/match-engine-configuration.service');
const controller = require('../../src/controllers/match-engine-configuration.controller');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');

test('controller publishes path version with authenticated author and returns 200', async (context) => {
  const configuration = new Configuration({ version: 'MATCH_V2', revision: 2, state: 'published',
    effectiveAt: new Date(), weights: INITIAL_MATCH_WEIGHTS,
    multipliers: { required: 1, desirable: 0.5, indifferent: 0 },
    defaultImportImportance: 'desirable', minimumMatchPercentage: 60,
    createdBy: '6512f1e2b3a1c2d3e4f5a6b7', cacheVersion: 2,
    recalculation: { policy: 'none', status: 'not_required' } });
  const publish = context.mock.method(service, 'publishMatchEngineConfiguration', async () => configuration);
  const request = { user: { id: 'admin', role: 'admin' }, params: { version: 'MATCH_V2' }, body: {} };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await controller.publish(request, response, assert.fail);
  assert.deepEqual(publish.mock.calls[0].arguments, [request.user, 'MATCH_V2', request.body]);
  assert.equal(response.code, 200);
  assert.equal(response.body.configuration.version, 'MATCH_V2');
});
