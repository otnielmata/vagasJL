const { INITIAL_MATCH_WEIGHTS } = require('./match-profile');

const CANDIDATE_PUBLIC_FIELDS = Object.freeze([
  'name',
  'photoUrl',
  'city',
  'state',
  'country',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'professionalSummary',
]);

const MATCH_PROFILE_PUBLIC_FIELDS = Object.freeze(
  Object.keys(INITIAL_MATCH_WEIGHTS).map((field) => `matchProfile.${field}`)
);

const FORMATION_PUBLIC_FIELDS = Object.freeze([
  'formation.engagementLevel',
  'formation.cohort',
  'formation.challengesCompleted',
  'formation.totalChallenges',
  'formation.score',
  'formation.participation',
  'formation.history',
  'formation.projects',
]);

const PUBLIC_PROFILE_FIELDS = Object.freeze([
  ...CANDIDATE_PUBLIC_FIELDS,
  ...MATCH_PROFILE_PUBLIC_FIELDS,
  ...FORMATION_PUBLIC_FIELDS,
]);

module.exports = {
  CANDIDATE_PUBLIC_FIELDS,
  MATCH_PROFILE_PUBLIC_FIELDS,
  FORMATION_PUBLIC_FIELDS,
  PUBLIC_PROFILE_FIELDS,
};
