const service = require('../services/vacancy.service');
const statusService = require('../services/vacancy-status.service');
const requirementsService = require('../services/vacancy-requirements.service');
const candidateRankingService = require('../services/candidate-ranking.service');

async function registerCompany(req, res, next) {
  try {
    const vacancy = await service.registerCompanyVacancy(req.user, req.params.id, req.body);
    return res.status(201).json({ vacancy: vacancy.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const vacancy = await statusService.updateStatus(req.user, req.params.id, req.body);
    return res.status(200).json({ vacancy: vacancy.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function updateRequirements(req, res, next) {
  try {
    const vacancy = await requirementsService.updateRequirements(req.user, req.params.id, req.body);
    return res.status(200).json({ vacancy: vacancy.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function rankCandidates(req, res, next) {
  try {
    const ranking = await candidateRankingService.rankCandidates(req.user, req.params.id, req.query);
    return res.status(200).json(ranking);
  } catch (error) {
    return next(error);
  }
}

module.exports = { registerCompany, updateStatus, updateRequirements, rankCandidates };
