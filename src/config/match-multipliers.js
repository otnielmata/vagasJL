function validMultipliers(input) {
  return input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).sort().join(',') === 'desirable,indifferent,required' &&
    input.required === 1 && input.indifferent === 0 &&
    typeof input.desirable === 'number' && Number.isFinite(input.desirable) &&
    input.desirable > 0 && input.desirable < 1;
}

module.exports = { validMultipliers };
