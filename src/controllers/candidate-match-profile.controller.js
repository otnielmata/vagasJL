const service = require('../services/candidate-match-profile.service');

async function register(req, res, next) {
  try {
    const profile = await service.registerMatchProfile(req.user, req.body);
    return res.status(201).json({ profile: profile.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const { profile, candidateStatus } = await service.updateMatchProfile(req.user, req.body, req.get('If-Match'));
    const result = profile.toJSON();
    result.matchEligible = candidateStatus === 'active' && service.hasMatchValues(result.values);
    res.set('ETag', `"${profile.revision}"`);
    return res.status(200).json({ profile: result });
  } catch (error) {
    return next(error);
  }
}

async function show(req, res, next) {
  try {
    const profile = await service.showMatchProfile(req.user, req.params.id);
    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteMatchProfile(req.user);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, update, show, remove };
