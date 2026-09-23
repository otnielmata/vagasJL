const service = require('../services/candidate-status.service');

async function updateStatus(req, res, next) {
  try {
    const result = await service.updateCandidateStatus(req.user, req.params.id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { updateStatus };
