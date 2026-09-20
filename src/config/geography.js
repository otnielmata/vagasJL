const DIMENSIONS = Object.freeze(['country', 'state', 'city']);

function normalizePlace(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 ||
      value.trim().toUpperCase() === 'UNKNOWN') return null;
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ');
}

function validGeographyWeights(weights) {
  if (typeof weights?.toObject === 'function') weights = weights.toObject();
  return weights && typeof weights === 'object' && !Array.isArray(weights) &&
    Object.keys(weights).length === DIMENSIONS.length && DIMENSIONS.every((key) =>
      Number.isSafeInteger(weights[key]) && weights[key] > 0);
}

module.exports = { DIMENSIONS, normalizePlace, validGeographyWeights };
