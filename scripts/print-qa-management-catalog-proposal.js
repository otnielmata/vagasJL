const { INITIAL_MATCH_WEIGHTS } = require('../src/config/match-profile');
const { QA_MANAGEMENT_FIELD_LABEL,
  PROPOSED_QA_MANAGEMENT_TOOLS } = require('../src/config/qa-management-tools');

const fields = Object.fromEntries(Object.entries(INITIAL_MATCH_WEIGHTS).map(([key, weight]) =>
  [key, { ...(key === 'tecnologies' ? { label: QA_MANAGEMENT_FIELD_LABEL } : {}),
    weight, options: key === 'tecnologies' ? PROPOSED_QA_MANAGEMENT_TOOLS : [] }]));

process.stdout.write(`${JSON.stringify({ fields }, null, 2)}\n`);
