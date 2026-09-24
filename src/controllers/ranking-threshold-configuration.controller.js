const { publishRankingThreshold } = require('../services/ranking-threshold-configuration.service');

async function publish(req, res, next) {
  try {
    const configuration = await publishRankingThreshold(req.user, req.body);
    return res.status(200).json({ configuration: configuration.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { publish };
