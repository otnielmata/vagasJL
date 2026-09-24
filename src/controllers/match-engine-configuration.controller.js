const service = require('../services/match-engine-configuration.service');

async function publish(req, res, next) {
  try {
    const configuration = await service.publishMatchEngineConfiguration(
      req.user, req.params.version, req.body
    );
    return res.status(200).json({ configuration: configuration.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { publish };
