const service = require('../services/company.service');
const companyUserService = require('../services/company-user.service');

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

module.exports = { register, addUser };
