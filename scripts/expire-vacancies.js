const connectDB = require('../src/config/db');
const mongoose = require('mongoose');
const { expireOverdueVacancies } = require('../src/services/vacancy-status.service');

async function main() {
  await connectDB();
  const expired = await expireOverdueVacancies();
  process.stdout.write(`${expired} vagas expiradas\n`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  process.stderr.write(`${error.message}\n`);
  await mongoose.disconnect();
  process.exitCode = 1;
});
