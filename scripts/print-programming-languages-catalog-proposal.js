const { INITIAL_MATCH_WEIGHTS } = require('../src/config/match-profile');
const { PROPOSED_PROGRAMMING_LANGUAGES } = require('../src/config/programming-languages');

const fields = Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
  [key, { weight, options: key === 'programmingLanguages' ? PROPOSED_PROGRAMMING_LANGUAGES : [] }]));

process.stdout.write(`${JSON.stringify({ fields }, null, 2)}\n`);
