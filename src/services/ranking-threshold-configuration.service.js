const Configuration = require('../models/ranking-threshold-configuration.model');
const ApiError = require('../errors/api.error');

function validPercentage(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function validInput(input) {
  return input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).length === 1 && Object.hasOwn(input, 'minimumPercentage') &&
    validPercentage(input.minimumPercentage);
}

async function publishRankingThreshold(actor, input, now = new Date()) {
  if (actor?.role !== 'admin' || !/^[a-f\d]{24}$/i.test(actor.id || '')) {
    throw new ApiError(403, 'Apenas administradores podem configurar o ranking');
  }
  if (!validInput(input)) throw new ApiError(400, 'Limiar percentual invalido');
  await Configuration.init();
  const current = await Configuration.findOne().sort({ version: -1 });
  if (current?.minimumPercentage === input.minimumPercentage) return current;
  try {
    return await Configuration.create({ version: (current?.version || 0) + 1,
      minimumPercentage: input.minimumPercentage, effectiveAt: now, author: actor.id });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const latest = await Configuration.findOne().sort({ version: -1 });
    if (latest?.minimumPercentage === input.minimumPercentage) return latest;
    throw new ApiError(409, 'Configuracao alterada concorrentemente; tente novamente');
  }
}

async function getPublishedRankingThreshold() {
  const current = await Configuration.findOne().sort({ version: -1 });
  if (!current) return null;
  if (!Number.isSafeInteger(current.version) || current.version < 1 ||
      !validPercentage(current.minimumPercentage)) {
    throw new ApiError(503, 'Limiar do ranking publicado esta invalido');
  }
  return { version: current.version, minimumPercentage: current.minimumPercentage };
}

function meetsRankingThreshold(score, threshold) {
  if (!score?.eligibility?.eligible || !Number.isFinite(score.possiblePoints) ||
      score.possiblePoints <= 0) return false;
  if (!threshold) return true;
  const technicalPercentage = score.earnedPoints / score.possiblePoints * 100;
  return technicalPercentage >= threshold.minimumPercentage;
}

module.exports = { publishRankingThreshold, getPublishedRankingThreshold,
  meetsRankingThreshold };
