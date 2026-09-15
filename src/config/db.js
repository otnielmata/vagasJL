const mongoose = require('mongoose');
const config = require('./env');

/**
 * Estabelece a conexao com o MongoDB usando Mongoose.
 * Encerra o processo caso a conexao inicial falhe, pois a API depende do banco.
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(config.mongodb.uri);
    // eslint-disable-next-line no-console
    console.log(`[db] Conectado ao MongoDB (${mongoose.connection.name})`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[db] Falha ao conectar ao MongoDB:', error.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] Conexao com o MongoDB perdida');
  });
}

module.exports = connectDB;
