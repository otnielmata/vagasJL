const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/user.model');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Uso: npm run users:promote-master -- <email do usuario ja cadastrado>');
  }
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) throw new Error(`Usuario ${email} nao encontrado. Cadastre-o primeiro pelo site.`);
  if (user.role === 'master') {
    console.log(`${email} ja possui o perfil master.`);
    return;
  }
  const previousRole = user.role;
  await User.updateOne({ _id: user._id }, {
    $set: { role: 'master', status: 'active' },
    $inc: { tokenVersion: 1 },
  });
  console.log(`${email}: ${previousRole} -> master. Saia e entre novamente no site.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
