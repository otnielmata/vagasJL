const service = require('../services/candidate-engagement.service');

async function show(req, res, next) {
  try {
    const engagement = await service.getOwnEngagement(req.user, req.query);
    return res.status(200).json({ engagement });
  } catch (error) {
    return next(error);
  }
}

module.exports = { show };
