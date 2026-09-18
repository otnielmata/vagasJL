const { publishMultipliers } = require('../services/match-multipliers-configuration.service');

async function publish(req, res, next) {
  try {
    const configuration = await publishMultipliers(req.user, req.body);
    return res.status(200).json({ configuration: configuration.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { publish };
