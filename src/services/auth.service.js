const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const config = require('../config/env');

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Gera um token JWT assinado para o usuario informado.
 */
function generateToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Cria um novo usuario (hash de senha feito no model) e retorna usuario + token.
 */
async function register({ name, email, password, role }) {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, 'Ja existe um usuario cadastrado com este email');
  }

  const user = await User.create({ name, email, password, role });
  const token = generateToken(user);

  return { user, token };
}

/**
 * Valida credenciais e retorna usuario + token em caso de sucesso.
 */
async function login({ email, password }) {
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
