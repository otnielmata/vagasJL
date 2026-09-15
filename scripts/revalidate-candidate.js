const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { revalidatePendingCandidate } = require('../src/services/candidate.service');

async function main() {
  const candidateId = process.argv[2];
  if (!candidateId || !/^[a-f\d]{24}$/i.test(candidateId)) {
    throw new Error('Uso: npm run candidates:revalidate -- <ObjectId do candidato>');
  }
  await connectDB();
  const candidate = await revalidatePendingCandidate(candidateId);
  console.log(`Candidato ${candidate.id}: ${candidate.status}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
