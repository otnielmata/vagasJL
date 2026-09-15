const { randomBytes } = require('node:crypto');

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  BASE_URL: 'http://localhost:3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unit-tests-unused',
  JWT_SECRET: randomBytes(32).toString('hex'),
  JWT_EXPIRES_IN: '1h',
  CORS_ORIGIN: '*',
});
