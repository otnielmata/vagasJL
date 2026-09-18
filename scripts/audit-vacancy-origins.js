const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Vacancy = require('../src/models/vacancy.model');
const { assessVacancyForMatch } = require('../src/services/vacancy-origin.service');

async function run() {
  await connectDB();
  let reviewed = 0;
  let needsReview = 0;
  const vacancies = Vacancy.find().select('_id origin company importSource importSourceId +createdBy')
    .lean().cursor();
  for await (const vacancy of vacancies) {
    reviewed += 1;
    if (assessVacancyForMatch(vacancy).needsOriginReview) {
      needsReview += 1;
      console.log(`Vaga ${vacancy._id}: procedencia requer saneamento`);
    }
  }
  console.log(`Vagas verificadas: ${reviewed}; requerem saneamento: ${needsReview}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
