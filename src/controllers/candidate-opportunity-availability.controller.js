const availabilityService = require('../services/candidate-opportunity-availability.service');

async function update(req, res, next) {
  try {
    const availability = await availabilityService.updateOwnOpportunityAvailability(req.user, req.body);
    return res.status(200).json({ availability });
  } catch (error) {
    return next(error);
  }
}

module.exports = { update };
