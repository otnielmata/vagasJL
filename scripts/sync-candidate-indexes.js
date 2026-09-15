const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Candidate = require('../src/models/candidate.model');
const StudentAuthorization = require('../src/models/student-authorization.model');

async function run() {
  try {
    await connectDB();
    const candidateCollectionExists = await mongoose.connection.db
      .listCollections({ name: Candidate.collection.name }, { nameOnly: true })
      .hasNext();
    if (candidateCollectionExists) {
      await Candidate.collection.updateMany(
        { deletedAt: { $exists: false } },
        { $set: { deletedAt: null } }
      );
      const indexes = await Candidate.collection.indexes();
      if (indexes.some((index) => index.name === 'user_1')) {
        await Candidate.collection.dropIndex('user_1');
      }
    } else {
      await Candidate.createCollection();
    }
    const removedCandidateIndexes = await Candidate.syncIndexes();
    await StudentAuthorization.createIndexes();
    console.log('Indices de candidatos sincronizados:', removedCandidateIndexes);
    console.log('Indices da base de alunos verificados.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
