const service = require('../services/company.service');
const companyUserService = require('../services/company-user.service');
const registrationService = require('../services/company-registration.service');

async function register(req, res, next) {
  try {
    const company = await service.registerCompany(req.user, req.body);
    return res.status(201).json({ company: company.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function addUser(req, res, next) {
  try {
    const { membership, user } = await companyUserService.linkRecruiter(req.user, req.params.id, req.body);
    return res.status(201).json({ membership: membership.toJSON(), user });
  } catch (error) {
    return next(error);
  }
}

async function updateRegistration(req, res, next) {
  try {
    const result = await registrationService.updateRegistration(req.user, req.params.id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, addUser, updateRegistration };
