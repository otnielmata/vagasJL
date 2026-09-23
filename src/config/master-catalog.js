const CATEGORY_FIELDS = Object.freeze({
  competency: 'classification',
  test_automation: 'testAutomationTechnologies',
  qa_tool: 'tecnologies',
  ai_tool: 'genAITools',
  programming_language: 'programmingLanguages',
  role: 'role',
  specialization: 'specialization',
  test_type: 'classification',
});

function normalizeCatalogAlias(value) {
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[\s._-]+/g, '').replace(/[^a-z0-9+#/]/g, '');
}

module.exports = { CATEGORY_FIELDS, normalizeCatalogAlias };
