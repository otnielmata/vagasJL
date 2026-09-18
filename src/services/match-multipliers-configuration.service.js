const Configuration = require('../models/match-multipliers-configuration.model');
const ApiError = require('../errors/api.error');
const { validMultipliers } = require('../config/match-multipliers');

async function publishMultipliers(actor, input, now = new Date()) {
  if (actor?.role !== 'admin' || !/^[a-f\d]{24}$/i.test(actor.id || '')) {
    throw new ApiError(403, 'Apenas administradores podem configurar o Match');
  }
  if (!validMultipliers(input)) throw new ApiError(400, 'Multiplicadores invalidos');
  await Configuration.init();
  const current = await Configuration.findOne().sort({ version: -1 });
  if (current && current.multipliers.required === input.required &&
      current.multipliers.desirable === input.desirable &&
      current.multipliers.indifferent === input.indifferent) return current;
  try {
    return await Configuration.create({ version: (current?.version || 0) + 1,
      multipliers: input, effectiveAt: now, author: actor.id });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const latest = await Configuration.findOne().sort({ version: -1 });
    if (latest && latest.multipliers.required === input.required &&
        latest.multipliers.desirable === input.desirable &&
        latest.multipliers.indifferent === input.indifferent) return latest;
    throw new ApiError(409, 'Configuracao alterada concorrentemente; tente novamente');
  }
}

async function getPublishedMultipliers() {
  const current = await Configuration.findOne().sort({ version: -1 });
  const multipliers = current?.multipliers && typeof current.multipliers.toObject === 'function'
    ? current.multipliers.toObject() : current?.multipliers;
  if (!Number.isSafeInteger(current?.version) || current.version < 1 ||
      !validMultipliers(multipliers)) {
    throw new ApiError(503, 'Multiplicadores do Match nao publicados ou invalidos');
  }
  return { version: current.version, multipliers };
}

module.exports = { publishMultipliers, getPublishedMultipliers };
