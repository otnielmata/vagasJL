const UNKNOWN = 'UNKNOWN';

const CANDIDATE_STATUS = Object.freeze({
  PENDING_VALIDATION: 'pending_validation',
  INCOMPLETE_PROFILE: 'incomplete_profile',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
});

const PROFILE_FIELDS = Object.freeze([
  'photoUrl', 'phone', 'city', 'state', 'country', 'linkedinUrl', 'githubUrl',
  'portfolioUrl', 'professionalSummary', 'availability',
]);

module.exports = { UNKNOWN, CANDIDATE_STATUS, PROFILE_FIELDS };
