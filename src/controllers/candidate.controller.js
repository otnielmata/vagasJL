const candidateService = require('../services/candidate.service');

async function register(req, res, next) {
  try {
    const candidate = await candidateService.registerCandidate(req.user.id, req.body);
    return res.status(201).json({ candidate: candidate.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function validateEligibility(req, res, next) {
  try {
    const result = await candidateService.validateCandidateEligibility(req.params.id, req.user.id, req.body);
    return res.status(result.statusCode).json({ candidate: result.candidate.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function show(req, res, next) {
  try {
    const candidate = await candidateService.getCandidateById(
      req.params.id,
      req.user.id,
      req.user.role
    );
    return res.status(200).json({ candidate });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, validateEligibility, show };
