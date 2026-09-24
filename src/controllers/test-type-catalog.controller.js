const service = require('../services/test-type-catalog.service');

async function publish(req, res, next) {
  try {
    const catalog = await service.publishTestTypeCatalog(req.user, req.body);
    return res.status(200).json({ catalog: catalog.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { publish };
