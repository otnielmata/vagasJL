require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const MasterCatalogItem = require('../../src/models/master-catalog-item.model');
const service = require('../../src/services/master-catalog.service');
const controller = require('../../src/controllers/master-catalog.controller');

test('controller publishes path category and ID with authenticated author', async (context) => {
  const item = new MasterCatalogItem({ category: 'test_automation', id: 'cypress', revision: 1,
    name: 'Cypress', aliases: [], normalizedAliases: ['cypress'], active: true,
    state: 'published', effectiveAt: new Date(), reason: 'Publicacao',
    createdBy: '6512f1e2b3a1c2d3e4f5a6b7', profileConfigurationVersion: 2,
    cacheInvalidatedAt: new Date(), recalculation: { status: 'scheduled', scheduledFor: new Date() } });
  const publish = context.mock.method(service, 'publishMasterCatalogItem', async () => item);
  const request = { user: { id: 'admin', role: 'admin' },
    params: { category: 'test_automation', id: 'cypress' }, body: {} };
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await controller.publish(request, response, assert.fail);
  assert.deepEqual(publish.mock.calls[0].arguments, [request.user, 'test_automation',
    'cypress', request.body]);
  assert.equal(response.code, 200);
  assert.equal(response.body.item.id, 'cypress');
});
