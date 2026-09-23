const displayPermissionsService = require('../services/candidate-display-permissions.service');

async function update(req, res, next) {
  try {
    const permissions = await displayPermissionsService.updateOwnDisplayPermissions(req.user, req.body);
    return res.status(200).json({ permissions });
  } catch (error) {
    return next(error);
  }
}

module.exports = { update };
