const service = require('../services/vacancy.service');

async function registerCompany(req, res, next) {
  try {
    const vacancy = await service.registerCompanyVacancy(req.user, req.params.id, req.body);
    return res.status(201).json({ vacancy: vacancy.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { registerCompany };
