const mongoose = require('mongoose');
const config = require('./env');

let connectionPromise;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  mongoose.set('strictQuery', true);
  connectionPromise = mongoose.connect(config.mongodb.uri, {
    serverSelectionTimeoutMS: 5000,
  }).finally(() => {
    connectionPromise = undefined;
  });

  return connectionPromise;
}

module.exports = connectDB;
