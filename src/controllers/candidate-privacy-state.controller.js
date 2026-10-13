const service = require('../services/candidate-privacy-state.service');

async function show(req, res, next) {
  try {
    return res.status(200).json(await service.getOwnPrivacyState(req.user));
  } catch (error) {
    return next(error);
  }
}

module.exports = { show };
