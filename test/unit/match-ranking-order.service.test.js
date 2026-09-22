require('../support/env');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compareRankingRows } = require('../../src/services/match-ranking.service');

function orderedIds(rows) {
  return rows.sort(compareRankingRows).map((row) => row.stableId);
}

test('ranking orders percentages from highest to lowest', () => {
  const rows = [
    { stableId: '75', percentage: 75, matchedRequiredCount: 9 },
    { stableId: '90', percentage: 90, matchedRequiredCount: 0 },
    { stableId: '85', percentage: 85, matchedRequiredCount: 9 },
  ];
  assert.deepEqual(orderedIds(rows), ['90', '85', '75']);
});

test('ranking resolves ties by required matches, update date and stable id', () => {
  const rows = [
    { stableId: 'd', percentage: 80, matchedRequiredCount: 1,
      updatedAt: new Date('2026-09-20T00:00:00Z') },
    { stableId: 'c', percentage: 80, matchedRequiredCount: 2,
      updatedAt: new Date('2026-09-19T00:00:00Z') },
    { stableId: 'b', percentage: 80, matchedRequiredCount: 2,
      updatedAt: new Date('2026-09-20T00:00:00Z') },
    { stableId: 'a', percentage: 80, matchedRequiredCount: 2,
      updatedAt: new Date('2026-09-20T00:00:00Z') },
  ];
  assert.deepEqual(orderedIds(rows), ['a', 'b', 'c', 'd']);
});

test('engagement metadata does not affect technical ranking order', () => {
  const rows = [
    { stableId: 'a', percentage: 90, matchedRequiredCount: 1, engagement: 0 },
    { stableId: 'b', percentage: 70, matchedRequiredCount: 1, engagement: 100 },
  ];
  assert.deepEqual(orderedIds(rows), ['a', 'b']);
});
