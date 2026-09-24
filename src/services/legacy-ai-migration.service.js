const { normalizeCatalogAlias } = require('../config/master-catalog');
const ApiError = require('../errors/api.error');

const LEGACY_AI_FIELD = 'genAITecnologies';
const CANONICAL_AI_FIELD = 'genAITools';

function invalid() {
  throw new ApiError(400, 'Dados legados de IA invalidos');
}

function migrateLegacyAiValues(values, configuration, now = new Date()) {
  if (!values || typeof values !== 'object' || Array.isArray(values) ||
      !Object.hasOwn(values, LEGACY_AI_FIELD)) return { values, audit: null };
  const legacy = values[LEGACY_AI_FIELD];
  const submitted = Array.isArray(legacy) ? legacy : [legacy];
  if (!submitted.length || submitted.length > 50 || submitted.some((value) =>
    typeof value !== 'string' || !value.trim() || value.length > 100)) invalid();
  const field = configuration?.fields?.find((item) => item.key === CANONICAL_AI_FIELD);
  if (!field) throw new ApiError(503, 'Configuracao do Perfil de Match incompleta');
  const aliases = new Map();
  for (const option of field.options || []) {
    for (const name of [option.id, option.label, ...(option.aliases || [])]) {
      const normalized = normalizeCatalogAlias(name);
      const ids = aliases.get(normalized) || new Set();
      ids.add(option.id);
      aliases.set(normalized, ids);
    }
  }
  const entries = submitted.map((value) => {
    const ids = [...(aliases.get(normalizeCatalogAlias(value)) || [])];
    return { submitted: value.trim(), canonicalId: ids.length === 1 ? ids[0] : null,
      status: ids.length === 1 ? 'mapped' : 'pending' };
  });
  const mapped = entries.filter((entry) => entry.status === 'mapped').map((entry) => entry.canonicalId);
  const current = Object.hasOwn(values, CANONICAL_AI_FIELD)
    ? (Array.isArray(values[CANONICAL_AI_FIELD]) ? values[CANONICAL_AI_FIELD] : [values[CANONICAL_AI_FIELD]])
    : [];
  return {
    values: { ...Object.fromEntries(Object.entries(values).filter(([key]) => key !== LEGACY_AI_FIELD)),
      ...((current.length || mapped.length) ? { [CANONICAL_AI_FIELD]: [...current, ...mapped] } : {}) },
    audit: { at: now, sourceField: LEGACY_AI_FIELD, entries },
  };
}

module.exports = { migrateLegacyAiValues, LEGACY_AI_FIELD, CANONICAL_AI_FIELD };
