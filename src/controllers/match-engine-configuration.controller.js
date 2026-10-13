const service = require('../services/match-engine-configuration.service');

async function show(req, res, next) {
  try {
    const configuration = await service.getLatestMatchEngineConfiguration(req.user);
    return res.status(200).json({ configuration: configuration ? configuration.toJSON() : null });
  } catch (error) {
    return next(error);
  }
}

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

module.exports = { show, publish };
