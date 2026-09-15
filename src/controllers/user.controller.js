const userService = require('../services/user.service');

async function create(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const user = await userService.createUser({ name, email, password, role });
    return res.status(201).json({ user: user.toJSON() });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/users/me
 * Retorna o perfil do usuario autenticado (extraido do token JWT).
 */
async function getMe(req, res, next) {
  try {
    const user = await userService.getUserById(req.user.id);
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
}

module.exports = { create, getMe };
