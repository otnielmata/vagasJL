const Configuration = require('../models/import-importance-configuration.model');
const ApiError = require('../errors/api.error');

const IMPORTANCE = new Set(['required', 'desirable', 'indifferent']);

async function publishImportImportance(actor, input, now = new Date()) {
  if (actor?.role !== 'admin' || !/^[a-f\d]{24}$/i.test(actor.id || '')) {
    throw new ApiError(403, 'Apenas administradores podem configurar a importacao');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !IMPORTANCE.has(input.importance)) {
    throw new ApiError(400, 'Importancia padrao invalida');
  }
  await Configuration.init();
  const current = await Configuration.findOne().sort({ version: -1 });
  if (current?.importance === input.importance) return current;
  try {
    return await Configuration.create({ version: (current?.version || 0) + 1,
      importance: input.importance, effectiveAt: now, author: actor.id });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const latest = await Configuration.findOne().sort({ version: -1 });
    if (latest?.importance === input.importance) return latest;
    throw new ApiError(409, 'Configuracao alterada concorrentemente; tente novamente');
  }
}

module.exports = { publishImportImportance };
