const candidatePublicProfileService = require('../services/candidate-public-profile.service');

async function update(req, res, next) {
  try {
    const publicProfile = await candidatePublicProfileService.updateOwnPublicProfile(req.user, req.body);
    return res.status(200).json({ publicProfile });
  } catch (error) {
    return next(error);
  }
}

module.exports = { update };
