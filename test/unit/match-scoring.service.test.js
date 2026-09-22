const assert = require('node:assert/strict');
const { test } = require('node:test');
const { INITIAL_MATCH_WEIGHTS } = require('../../src/config/match-profile');
const { calculateMatchScore, TECHNICAL_FIELDS, DERIVED_FIELDS } = require('../../src/services/match-scoring.service');

function configuration() {
  return { version: 1, fields: Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) => ({ key, weight })) };
}

const technicalResults = {
  type: { applicable: true, matched: true },
  agile: { applicable: true, matched: false },
  genAITools: { applicable: false, matched: false },
};

test('scores only applicable technical criteria with configurable weights', () => {
  const result = calculateMatchScore({ technicalResults, configuration: configuration() });
  assert.equal(result.earnedPoints, 8);
  assert.equal(result.possiblePoints, 12);
  assert.equal(result.percentage, 66.67);
  assert.deepEqual(result.details, [
    { field: 'type', weight: 8, earnedPoints: 8 },
    { field: 'agile', weight: 4, earnedPoints: 0 },
  ]);
  assert.deepEqual(result.eligibility, { eligible: true, reason: null });
});

test('changing a published technical weight changes only eligible scoring', () => {
  const config = configuration();
  config.fields.find((field) => field.key === 'agile').weight = 8;
  const result = calculateMatchScore({ technicalResults, configuration: config });
  assert.equal(result.percentage, 50);
  assert.equal(result.possiblePoints, 16);
});

test('derived and legacy fields never earn or lose points or enter breakdown', () => {
  const baseline = calculateMatchScore({ technicalResults, configuration: configuration() });
  const variations = [0, 1, -100, true, false, null, 'remove', { value: 999 }];
  assert.equal(DERIVED_FIELDS.length, 7);
  for (const field of DERIVED_FIELDS) {
    assert.equal(TECHNICAL_FIELDS.includes(field), false);
    for (const value of variations) {
      const changed = calculateMatchScore({
        technicalResults: { ...technicalResults, [field]: value },
        configuration: configuration(),
      });
      assert.equal(changed.percentage, baseline.percentage, field);
      assert.equal(changed.earnedPoints, baseline.earnedPoints, field);
      assert.equal(changed.possiblePoints, baseline.possiblePoints, field);
      assert.deepEqual(changed.details, baseline.details, field);
    }
  }
});

test('removal reason changes eligibility separately without numeric penalty', () => {
  const baseline = calculateMatchScore({ technicalResults, configuration: configuration() });
  const flagged = calculateMatchScore({ technicalResults,
    vacancy: { reasonToBeRemoved: 'vaga expirada' }, configuration: configuration() });
  assert.deepEqual(flagged.eligibility, { eligible: false, reason: 'vaga expirada' });
  assert.equal(flagged.percentage, baseline.percentage);
  assert.equal(flagged.earnedPoints, baseline.earnedPoints);
  assert.equal(flagged.possiblePoints, baseline.possiblePoints);
  assert.deepEqual(flagged.details, baseline.details);
});

test('absent, null and legacy derived fields never create implicit points', () => {
  for (const resultFields of [undefined, {}, { hasGenAI: null, skillsRequiredCounter: undefined },
    { hasGenAI: true, amountOfGenAITools: 3 }]) {
    const result = calculateMatchScore({ technicalResults: resultFields, configuration: configuration() });
    assert.equal(result.percentage, null);
    assert.equal(result.calculationStatus, 'not_calculable');
    assert.equal(result.earnedPoints, 0);
    assert.equal(result.possiblePoints, 0);
    assert.deepEqual(result.details, []);
  }
});

test('unconfigured derived weights cannot be published into the scoring whitelist', () => {
  const config = configuration();
  config.fields.push({ key: 'hasGenAI', weight: 100 });
  assert.throws(() => calculateMatchScore({ technicalResults, configuration: config }), TypeError);
  config.fields.pop();
  config.fields[0].key = 'hasGenAI';
  assert.throws(() => calculateMatchScore({ technicalResults, configuration: config }), TypeError);
});

test('rejects incomplete or malformed technical configuration', () => {
  const config = configuration();
  config.fields.pop();
  assert.throws(() => calculateMatchScore({ technicalResults, configuration: config }), TypeError);
  assert.throws(() => calculateMatchScore({ technicalResults, configuration: null }), TypeError);
  const complete = configuration();
  complete.fields[0].weight = 0;
  assert.throws(() => calculateMatchScore({ technicalResults, configuration: complete }), TypeError);
});

test('invalid result for applicable technical criterion fails rather than awarding points', () => {
  assert.throws(() => calculateMatchScore({
    technicalResults: { type: { applicable: true, matched: 'yes' } }, configuration: configuration(),
  }), TypeError);
});
