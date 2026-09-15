const candidateService = require('../services/candidate.service');

async function register(req, res, next) {
  try {
    const candidate = await candidateService.registerCandidate(req.user.id, req.body);
    return res.status(201).json({ candidate: candidate.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register };
