require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const MatchProfile = require('../../src/models/candidate-match-profile.model');

test('stores canonical values separately and hides owner and deletion audit', () => {
  const profile = new MatchProfile({
    candidate: '6512f1e2b3a1c2d3e4f5a6b6',
    user: '6512f1e2b3a1c2d3e4f5a6b7',
    configurationVersion: 1,
    values: { testAutomationTechnologies: ['cypress'], yearsOfExperience: 2.5 },
  });
  assert.equal(profile.validateSync(), undefined);
  assert.equal(profile.deletedAt, null);
  assert.equal(profile.revision, 1);
  const result = profile.toJSON();
  assert.equal(result.user, undefined);
  assert.equal(result.deletedAt, undefined);
  assert.equal(result.values.testAutomationTechnologies[0], 'cypress');
  assert.ok(result.pendingFields.includes('type'));
  assert.equal(result.pendingFields.includes('yearsOfExperience'), false);
  const indexes = MatchProfile.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.candidate === 1 && options.unique &&
    options.partialFilterExpression.deletedAt === null));
});
