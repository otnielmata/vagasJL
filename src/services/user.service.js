const User = require('../models/user.model');
const { ApiError } = require('./auth.service');

/**
 * Retorna o perfil de um usuario pelo id, lancando erro 404 caso nao exista.
 */
async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'Usuario nao encontrado');
  }
  return user;
}

module.exports = {
  getUserById,
};
