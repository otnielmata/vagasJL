const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const { UNKNOWN, PROFILE_FIELDS, CANDIDATE_STATUS } = require('../../src/config/candidate');

const input = { user: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria', email: 'maria@example.com' };

test('defaults to pending and persists every omitted profile field as UNKNOWN', () => {
  const candidate = new Candidate(input);
  assert.equal(candidate.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  assert.equal(candidate.visibleToCompanies, false);
  for (const field of PROFILE_FIELDS) assert.equal(candidate[field], UNKNOWN);
  assert.equal(candidate.validateSync(), undefined);
});

for (const status of Object.values(CANDIDATE_STATUS)) {
  test(`company visibility for ${status} follows the active-only rule`, () => {
    const candidate = new Candidate({ ...input, status });
    assert.equal(candidate.visibleToCompanies, status === CANDIDATE_STATUS.ACTIVE);
    assert.equal(candidate.toJSON().visibleToCompanies, status === CANDIDATE_STATUS.ACTIVE);
  });
}

test('rejects unknown status and declares unique user and email indexes', () => {
  assert.ok(new Candidate({ ...input, status: 'approved' }).validateSync().errors.status);
  assert.deepEqual(Object.keys(new Candidate({}).validateSync().errors).sort(), ['email', 'name', 'user']);
  for (const field of ['user', 'email']) {
    assert.ok(Candidate.schema.indexes().some(([keys, options]) => keys[field] === 1 && options.unique));
  }
});

test('company query restricts results to active candidates', (context) => {
  const query = {};
  const find = context.mock.method(Candidate, 'find', () => query);
  assert.equal(Candidate.findVisibleToCompanies(), query);
  assert.deepEqual(find.mock.calls[0].arguments, [{ status: 'active' }]);
});

test('does not persist client verification flags or purchase proof', () => {
  const candidate = new Candidate({ ...input, purchaseCode: 'private-code', studentVerified: true });
  assert.equal(candidate.toJSON().purchaseCode, undefined);
  assert.equal(candidate.toJSON().studentVerified, undefined);
});
