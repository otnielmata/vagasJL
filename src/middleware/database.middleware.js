const connectDB = require('../config/db');

async function ensureDatabase(req, res, next) {
  try {
    await connectDB();
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = ensureDatabase;
