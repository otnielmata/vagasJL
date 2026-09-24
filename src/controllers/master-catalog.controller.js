const service = require('../services/master-catalog.service');

async function publish(req, res, next) {
  try {
    const item = await service.publishMasterCatalogItem(req.user, req.params.category,
      req.params.id, req.body);
    return res.status(200).json({ item: item.toJSON() });
  } catch (error) {
    return next(error);
  }
}

module.exports = { publish };
