const { INITIAL_MATCH_WEIGHTS } = require('../src/config/match-profile');
const { PROPOSED_AUTOMATION_TOOLS } = require('../src/config/automation-tools');

const fields = Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
  [key, { weight, options: key === 'testAutomationTechnologies' ? PROPOSED_AUTOMATION_TOOLS : [] }]));

process.stdout.write(`${JSON.stringify({ fields }, null, 2)}\n`);
