const Configuration = require('../models/match-profile-configuration.model');
const { normalizeCatalogAlias } = require('../config/master-catalog');
const ApiError = require('../errors/api.error');

const LEGACY_VACANCY_TRANSFORMER_VERSION = 'LEGACY_V1';
const FIELD_ALIASES = Object.freeze({
  testAutomationTechnologies: Object.freeze(['testAutomationTecnologies']),
  qaTools: Object.freeze(['tecnologies', 'technologies']),
  specialization: Object.freeze(['especialization']),
});

function invalid(message = 'Compatibilidade do JSON legado invalida') {
  throw new ApiError(400, message);
}

function catalogFor(configuration, field) {
  const definition = configuration?.fields?.find((item) => item.key === field);
  if (!definition || !Array.isArray(definition.options) || !definition.options.length) {
    throw new ApiError(503, 'Catalogo canonico indisponivel para compatibilidade');
  }
  const catalog = new Map();
  for (const option of definition.options) {
    for (const name of [option.id, option.label, ...(option.aliases || [])]) {
      catalog.set(normalizeCatalogAlias(name), option.id);
    }
  }
  return catalog;
}

function normalizeSubmission(submitted, field, catalog) {
  if (submitted === false) return { signature: 'UNIDENTIFIED', value: false };
  const list = Array.isArray(submitted) ? submitted : [submitted];
  if (!list.length || list.length > 50) invalid();
  const choices = new Map();
  for (const choice of list) {
    let value = choice;
    let identified = false;
    if (choice && typeof choice === 'object' && !Array.isArray(choice)) {
      if (Object.keys(choice).sort().join(',') !== 'id,identified' || choice.identified !== true) invalid();
      value = choice.id;
      identified = true;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 100) invalid();
    const id = catalog.get(normalizeCatalogAlias(value));
    if (!id) invalid(`Valor de ${field} fora do Catalogo Mestre publicado`);
    const previous = choices.get(id);
    if (previous !== undefined && previous !== identified) {
      invalid(`Representacoes conflitantes para ${field}`);
    }
    choices.set(id, identified);
  }
  const normalized = [...choices].sort(([left], [right]) => left.localeCompare(right));
  const values = normalized.map(([id, identified]) => identified ? { identified: true, id } : id);
  return { signature: JSON.stringify(normalized), value: Array.isArray(submitted) ? values : values[0] };
}

function transformValues(values, configuration) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { values, audit: null };
  const transformed = { ...values };
  const sourceFields = [];
  const warnings = [];
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const present = [canonical, ...aliases].filter((field) => Object.hasOwn(values, field));
    const legacy = present.filter((field) => field !== canonical);
    if (!legacy.length) continue;
    const catalog = catalogFor(configuration, canonical);
    const normalized = present.map((field) => ({ field,
      ...normalizeSubmission(values[field], canonical, catalog) }));
    if (normalized.some((entry) => entry.signature !== normalized[0].signature)) {
      invalid(`Conflito entre ${canonical} e seus aliases legados`);
    }
    transformed[canonical] = normalized[0].value;
    for (const sourceField of legacy) {
      delete transformed[sourceField];
      sourceFields.push(sourceField);
      warnings.push({ code: 'DEPRECATED_FIELD', sourceField, targetField: canonical });
    }
  }
  if (!sourceFields.length) return { values: transformed, audit: null };
  return { values: transformed, audit: { version: LEGACY_VACANCY_TRANSFORMER_VERSION,
    sourceFields: [...new Set(sourceFields)].sort(),
    warnings: warnings.sort((left, right) => left.sourceField.localeCompare(right.sourceField)) } };
}

async function transformLegacyVacancyInput(input, configuration) {
  const published = configuration || await Configuration.findOne().sort({ version: -1 });
  if (!published) throw new ApiError(503, 'Configuracao do Perfil de Match nao publicada');
  const transformation = transformValues(input?.matchProfile?.values, published);
  if (!transformation.audit) return { content: input, audit: null, configuration: published };
  return { content: { ...input, matchProfile: { ...input.matchProfile, values: transformation.values } },
    audit: transformation.audit, configuration: published };
}

module.exports = { transformLegacyVacancyInput, transformValues, FIELD_ALIASES,
  LEGACY_VACANCY_TRANSFORMER_VERSION };
