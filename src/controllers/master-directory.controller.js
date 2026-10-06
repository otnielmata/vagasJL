const service = require('../services/master-directory.service');

async function listCompanies(req, res, next) {
  try {
    return res.status(200).json(await service.listCompanies(req.user, req.query));
  } catch (error) {
    return next(error);
  }
}

async function listRecruiters(req, res, next) {
  try {
    return res.status(200).json(await service.listRecruiters(req.user, req.query));
  } catch (error) {
    return next(error);
  }
}

async function listCandidates(req, res, next) {
  try {
    return res.status(200).json(await service.listCandidates(req.user, req.query));
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCompanies, listRecruiters, listCandidates };
