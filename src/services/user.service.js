const User = require('../models/user.model');
const ApiError = require('../errors/api.error');

async function createUser({ name, email, password, role = 'candidate' }) {
  if (!['candidate', 'company'].includes(role)) {
    throw new ApiError(400, 'Papel (role) invalido');
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    await User.init();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ApiError(409, 'Ja existe um usuario cadastrado com este email');
    }

    return await User.create({ name, email: normalizedEmail, password, role, status: 'active' });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um usuario cadastrado com este email');
    }
    if (error.name === 'ValidationError') {
      throw new ApiError(400, 'Dados invalidos');
    }
    throw error;
  }
}

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

async function updateUser(id, authenticatedId, { name, email, password }) {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'Usuario nao encontrado');
  }
  if (user.id !== authenticatedId.toLowerCase()) {
    throw new ApiError(403, 'Voce so pode editar seus proprios dados');
  }

  try {
    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        await User.init();
        const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (existingUser) {
          throw new ApiError(409, 'Ja existe um usuario cadastrado com este email');
        }
        user.email = normalizedEmail;
        user.emailVerifiedAt = null;
      }
    }
    if (name !== undefined) user.name = name;
    if (password !== undefined) user.password = password;
    return await user.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'Ja existe um usuario cadastrado com este email');
    }
    if (error.name === 'ValidationError') {
      throw new ApiError(400, 'Dados invalidos');
    }
    if (error.name === 'DocumentNotFoundError') {
      throw new ApiError(404, 'Usuario nao encontrado');
    }
    throw error;
  }
}

async function deleteUser(id, authenticatedId) {
  try {
    await User.db.transaction(async (session) => {
      const user = await User.findById(id).session(session);
      if (!user) throw new ApiError(404, 'Usuario nao encontrado');
      if (user.id !== authenticatedId.toLowerCase()) {
        throw new ApiError(403, 'Voce so pode excluir sua propria conta');
      }
      if (user.status !== 'active') throw new ApiError(401, 'Usuario inativo');

      await User.db.collection('candidates').deleteMany({ user: user._id }, { session });
      await User.db.collection('companyusers').deleteMany({ user: user._id }, { session });
      const result = await User.deleteOne({ _id: user._id, status: 'active' }, { session });
      if (result.deletedCount !== 1) throw new ApiError(404, 'Usuario nao encontrado');
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if (error.code === 20) {
      throw new ApiError(503, 'Exclusao indisponivel: configure MongoDB com suporte a transacoes');
    }
    throw error;
  }
}

async function getPublicUserById(id) {
  const user = await User.findById(id).select('_id name').lean();
  if (!user) {
    throw new ApiError(404, 'Usuario nao encontrado');
  }
  return { _id: user._id, name: user.name };
}

module.exports = {
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getPublicUserById,
};
