const UNKNOWN = 'UNKNOWN';

const CANDIDATE_STATUS = Object.freeze({
  PENDING_VALIDATION: 'pending_validation',
  INCOMPLETE_PROFILE: 'incomplete_profile',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
});

const ELIGIBILITY_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const ELIGIBILITY_METHOD = Object.freeze({
  UNKNOWN: 'unknown',
  EMAIL: 'email',
  PURCHASE_CODE: 'purchase_code',
  TRUSTED_IDENTIFIER: 'trusted_identifier',
  MULTIPLE: 'multiple',
  LEGACY: 'legacy',
});

const ELIGIBILITY_SOURCE = Object.freeze({
  PENDING: 'pending',
  MONGODB: 'mongodb',
  LEGACY: 'legacy',
});

const PROFILE_FIELDS = Object.freeze([
  'photoUrl', 'phone', 'city', 'state', 'country', 'linkedinUrl', 'githubUrl',
  'portfolioUrl', 'professionalSummary', 'availability',
]);

module.exports = {
  UNKNOWN,
  CANDIDATE_STATUS,
  ELIGIBILITY_STATUS,
  ELIGIBILITY_METHOD,
  ELIGIBILITY_SOURCE,
  PROFILE_FIELDS,
};
