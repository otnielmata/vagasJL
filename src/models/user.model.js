const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'O nome e obrigatorio'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'O email e obrigatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email invalido'],
    },
    password: {
      type: String,
      required: [true, 'A senha e obrigatoria'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['candidate', 'company', 'admin'],
      default: 'candidate',
    },
  },
  {
    timestamps: true,
  }
);

// Faz o hash da senha automaticamente antes de salvar, apenas quando ela for alterada
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

// Compara a senha informada com o hash armazenado
userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove campos sensiveis ao converter o documento para JSON
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
