const service = require('../services/candidate-match-profile.service');

async function register(req, res, next) {
  try {
    const profile = await service.registerMatchProfile(req.user, req.body);
    return res.status(201).json({ profile: service.serializeMatchProfile(profile) });
  } catch (error) {
    return next(error);
  }
}

async function show(req, res, next) {
  try {
    const profile = await service.getMatchProfile(req.user);
    res.set('ETag', `"${profile.revision}"`);
    return res.status(200).json({ profile: service.serializeMatchProfile(profile) });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const { profile, candidateStatus } = await service.updateMatchProfile(req.user, req.body, req.get('If-Match'));
    const result = service.serializeMatchProfile(profile);
    result.matchEligible = candidateStatus === 'active' && Object.keys(result.values).length > 0;
    res.set('ETag', `"${profile.revision}"`);
    return res.status(200).json({ profile: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, show, update };
