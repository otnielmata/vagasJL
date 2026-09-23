const CONTACT_DISPLAY_FIELDS = Object.freeze([
  'email',
  'phone',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
]);

const FORMATION_DISPLAY_FIELDS = Object.freeze([
  'engagementLevel',
  'cohort',
  'challengesCompleted',
  'totalChallenges',
  'score',
  'participation',
  'history',
  'projects',
]);

module.exports = { CONTACT_DISPLAY_FIELDS, FORMATION_DISPLAY_FIELDS };
