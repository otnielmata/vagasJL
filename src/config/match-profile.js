const INITIAL_MATCH_WEIGHTS = Object.freeze({
  type: 8,
  agile: 4,
  programming: 3,
  automation: 5,
  webTesting: 6,
  apiTesting: 7,
  mobileTesting: 5,
  desktopTesting: 4,
  higherEducationDegree: 3,
  english: 7,
  spanish: 3,
  yearsOfExperience: 9,
  continuousIntegration: 6,
  certification: 2,
  testAutomationTechnologies: 10,
  tecnologies: 5,
  programmingLanguages: 9,
  genAITools: 5,
  level: 10,
  classification: 3,
  role: 5,
  specialization: 7,
});

function normalizeMatchAlias(value) {
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ');
}

module.exports = { INITIAL_MATCH_WEIGHTS, normalizeMatchAlias };
