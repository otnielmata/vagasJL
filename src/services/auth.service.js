const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const config = require('../config/env');
const ApiError = require('../errors/api.error');
const userService = require('./user.service');

/**
 * Gera um token JWT assinado para o usuario informado.
 */
function generateToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Cria um novo usuario (hash de senha feito no model) e retorna usuario + token.
 */
async function register({ name, email, password, role = 'candidate' }) {
  if (!['candidate', 'company'].includes(role)) {
    throw new ApiError(422, 'Papel (role) invalido');
  }

  const user = await userService.createUser({ name, email, password, role });
  const token = generateToken(user);

  return { user, token };
}

/**
 * Valida credenciais e retorna usuario + token em caso de sucesso.
 */
async function login({ email, password }) {
  email = email.trim().toLowerCase();
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Credenciais invalidas');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Credenciais invalidas');
  }

  const token = generateToken(user);

  return { user, token };
}

module.exports = {
  ApiError,
  generateToken,
  register,
  login,
};
