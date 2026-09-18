const service = require('../services/company.service');

async function register(req, res, next) {
  try {
    const company = await service.registerCompany(req.user, req.body);
    return res.status(201).json({ company: company.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register };
