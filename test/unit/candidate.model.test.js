const assert = require('node:assert/strict');
const { test } = require('node:test');
const Candidate = require('../../src/models/candidate.model');
const {
  UNKNOWN,
  PROFILE_FIELDS,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
} = require('../../src/config/candidate');

const input = { user: '6512f1e2b3a1c2d3e4f5a6b7', name: 'Maria', email: 'maria@example.com' };

test('defaults to pending and persists every omitted profile field as UNKNOWN', () => {
  const candidate = new Candidate(input);
  assert.equal(candidate.status, CANDIDATE_STATUS.PENDING_VALIDATION);
  assert.equal(candidate.eligibility.status, ELIGIBILITY_STATUS.PENDING);
  assert.equal(candidate.eligibility.method, ELIGIBILITY_METHOD.UNKNOWN);
  assert.equal(candidate.eligibility.source, ELIGIBILITY_SOURCE.PENDING);
  assert.equal(candidate.eligibility.lastAttemptAt, null);
  assert.equal(candidate.eligibility.approvedAt, null);
  assert.equal(candidate.deletedAt, null);
  assert.equal(candidate.publicProfile.enabled, false);
  assert.deepEqual(candidate.publicProfile.fields, []);
  assert.equal(candidate.publicProfile.cacheVersion, 1);
  assert.equal(candidate.availableForOpportunities, false);
  assert.equal(candidate.opportunityAvailabilityChangedAt, null);
  assert.deepEqual(candidate.enterpriseDisplayPermissions.contact, []);
  assert.deepEqual(candidate.enterpriseDisplayPermissions.formation, []);
  assert.equal(candidate.visibleToCompanies, false);
  for (const field of PROFILE_FIELDS) assert.equal(candidate[field], UNKNOWN);
  assert.equal(candidate.validateSync(), undefined);
});

test('stores public-profile consent and its audit privately with a controlled whitelist', () => {
  const changedAt = new Date('2026-09-23T12:00:00.000Z');
  const candidate = new Candidate({
    ...input,
    publicProfile: {
      enabled: true,
      fields: ['name', 'matchProfile.apiTesting', 'formation.projects'],
      consentedAt: changedAt,
      cacheVersion: 2,
      cacheInvalidatedAt: changedAt,
    },
    publicProfileConsentHistory: [{
      action: 'opt_in', fields: ['name'], actor: input.user, changedAt,
    }],
  });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(Candidate.schema.path('publicProfile').options.select, false);
  assert.equal(Candidate.schema.path('publicProfileConsentHistory').options.select, false);
  assert.equal(candidate.toJSON().publicProfile, undefined);
  assert.equal(candidate.toJSON().publicProfileConsentHistory, undefined);
  const invalid = new Candidate({ ...input, publicProfile: { enabled: true, fields: ['email'] } });
  assert.ok(invalid.validateSync().errors['publicProfile.fields.0']);
});

for (const status of Object.values(CANDIDATE_STATUS)) {
  test(`company visibility for ${status} requires active status and explicit availability`, () => {
    const candidate = new Candidate({ ...input, status, availableForOpportunities: true });
    const expected = status === CANDIDATE_STATUS.ACTIVE;
    assert.equal(candidate.visibleToCompanies, expected);
    assert.equal(candidate.toJSON().visibleToCompanies, expected);
  });
}

test('rejects unknown status and enforces one current profile per user plus unique active email', () => {
  assert.ok(new Candidate({ ...input, status: 'approved' }).validateSync().errors.status);
  assert.deepEqual(Object.keys(new Candidate({}).validateSync().errors).sort(), ['email', 'name', 'user']);
  const indexes = Candidate.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.user === 1 && options.unique &&
    options.name === 'unique_current_candidate_user' &&
    options.partialFilterExpression.deletedAt === null));
  assert.ok(indexes.some(([keys, options]) => keys.email === 1 && options.unique &&
    options.name === 'unique_active_candidate_email' &&
    options.partialFilterExpression.status === CANDIDATE_STATUS.ACTIVE));
  assert.equal(Candidate.schema.path('email').options.unique, undefined);
  assert.equal(Candidate.schema.path('user').options.unique, undefined);
});

test('company query requires active, validated and explicitly available candidates', (context) => {
  const query = {};
  const find = context.mock.method(Candidate, 'find', () => query);
  assert.equal(Candidate.findVisibleToCompanies(), query);
  assert.deepEqual(find.mock.calls[0].arguments, [{
    status: 'active',
    availableForOpportunities: true,
    'eligibility.status': 'approved',
    deletedAt: null,
  }]);
});

test('stores opportunity availability audit and cache metadata privately', () => {
  const changedAt = new Date('2026-09-23T14:00:00.000Z');
  const candidate = new Candidate({
    ...input,
    availableForOpportunities: true,
    opportunityAvailabilityChangedAt: changedAt,
    opportunitySearchCacheVersion: 2,
    opportunitySearchCacheInvalidatedAt: changedAt,
    opportunityAvailabilityHistory: [{
      availableForOpportunities: true, actor: input.user, changedAt,
    }],
  });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(Candidate.schema.path('opportunityAvailabilityHistory').options.select, false);
  assert.equal(Candidate.schema.path('opportunitySearchCacheVersion').options.select, false);
  assert.equal(Candidate.schema.path('opportunitySearchCacheInvalidatedAt').options.select, false);
  const json = candidate.toJSON();
  assert.equal(json.availableForOpportunities, true);
  assert.equal(json.opportunityAvailabilityHistory, undefined);
  assert.equal(json.opportunitySearchCacheVersion, undefined);
  assert.equal(json.opportunitySearchCacheInvalidatedAt, undefined);
});

test('stores granular enterprise display permissions and audit privately', () => {
  const changedAt = new Date('2026-09-23T15:00:00.000Z');
  const candidate = new Candidate({
    ...input,
    enterpriseDisplayPermissions: {
      contact: ['linkedinUrl'], formation: ['cohort'], changedAt,
      cacheVersion: 2, cacheInvalidatedAt: changedAt,
    },
    enterpriseDisplayPermissionHistory: [{
      contact: ['linkedinUrl'], formation: ['cohort'], actor: input.user, changedAt,
    }],
  });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(Candidate.schema.path('enterpriseDisplayPermissions').options.select, false);
  assert.equal(Candidate.schema.path('enterpriseDisplayPermissionHistory').options.select, false);
  assert.equal(candidate.toJSON().enterpriseDisplayPermissions, undefined);
  assert.equal(candidate.toJSON().enterpriseDisplayPermissionHistory, undefined);
  const invalid = new Candidate({ ...input,
    enterpriseDisplayPermissions: { contact: ['password'] } });
  assert.ok(invalid.validateSync().errors['enterpriseDisplayPermissions.contact.0']);
});

test('does not persist client verification flags or student proofs', () => {
  const candidate = new Candidate({
    ...input,
    purchaseCode: 'private-code',
    trustedIdentifier: 'private-id',
    studentVerified: true,
  });
  assert.equal(candidate.toJSON().purchaseCode, undefined);
  assert.equal(candidate.toJSON().trustedIdentifier, undefined);
  assert.equal(candidate.toJSON().studentVerified, undefined);
});

test('persists controlled validation metadata while hiding its internal source', () => {
  const attempt = new Date('2026-09-15T10:00:00.000Z');
  const candidate = new Candidate({
    ...input,
    status: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
    eligibility: {
      status: ELIGIBILITY_STATUS.APPROVED,
      method: ELIGIBILITY_METHOD.PURCHASE_CODE,
      source: ELIGIBILITY_SOURCE.MONGODB,
      lastAttemptAt: attempt,
      approvedAt: attempt,
    },
  });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(candidate.eligibility.source, ELIGIBILITY_SOURCE.MONGODB);
  assert.equal(candidate.toJSON().eligibility.source, undefined);
  assert.equal(candidate.toJSON().eligibility.method, ELIGIBILITY_METHOD.PURCHASE_CODE);
});

test('rejects invalid validation status, method and oversized source', () => {
  for (const eligibility of [
    { status: 'verified' },
    { method: 'client_flag' },
    { source: 'a'.repeat(101) },
  ]) {
    const error = new Candidate({ ...input, eligibility }).validateSync();
    assert.ok(Object.keys(error.errors).some((path) => path.startsWith('eligibility.')));
  }
});

test('stores invalidated eligibility as private audit history', () => {
  const invalidatedAt = new Date('2026-09-15T12:00:00.000Z');
  const candidate = new Candidate({
    ...input,
    eligibilityHistory: [{
      email: input.email,
      status: ELIGIBILITY_STATUS.APPROVED,
      method: ELIGIBILITY_METHOD.EMAIL,
      source: ELIGIBILITY_SOURCE.MONGODB,
      lastAttemptAt: invalidatedAt,
      approvedAt: invalidatedAt,
      invalidatedAt,
    }],
  });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(candidate.eligibilityHistory.length, 1);
  assert.equal(Candidate.schema.path('eligibilityHistory').options.select, false);
  assert.equal(candidate.toJSON().eligibilityHistory, undefined);
});

test('stores administrative status history privately', () => {
  const changedAt = new Date('2026-09-23T19:00:00.000Z');
  const candidate = new Candidate({ ...input, statusHistory: [{
    from: CANDIDATE_STATUS.INCOMPLETE_PROFILE,
    to: CANDIDATE_STATUS.ACTIVE,
    actor: input.user,
    changedAt,
    reason: 'Perfil revisado',
  }] });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(Candidate.schema.path('statusHistory').options.select, false);
  assert.equal(candidate.toJSON().statusHistory, undefined);
});

test('stores logical deletion date privately and releases only the current-user index', () => {
  const deletedAt = new Date('2026-09-15T12:00:00.000Z');
  const candidate = new Candidate({ ...input, status: CANDIDATE_STATUS.INACTIVE, deletedAt });
  assert.equal(candidate.validateSync(), undefined);
  assert.equal(candidate.deletedAt, deletedAt);
  assert.equal(Candidate.schema.path('deletedAt').options.select, false);
  assert.equal(candidate.toJSON().deletedAt, undefined);
  assert.equal(candidate.visibleToCompanies, false);
});
