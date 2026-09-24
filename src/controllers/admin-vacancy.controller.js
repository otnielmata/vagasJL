const service = require('../services/admin-vacancy.service');

async function manage(req, res, next) {
  try {
    const result = await service.manageAdminVacancy(req.user, req.params.id, req.body);
    return res.status(result.created ? 201 : 200).json({ vacancy: result.vacancy.toJSON(),
      created: result.created, changed: result.changed });
  } catch (error) {
    return next(error);
  }
}

module.exports = { manage };
