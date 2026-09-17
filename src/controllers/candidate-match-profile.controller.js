const service = require('../services/candidate-match-profile.service');

async function register(req, res, next) {
  try {
    const profile = await service.registerMatchProfile(req.user, req.body);
    return res.status(201).json({ profile: profile.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register };
