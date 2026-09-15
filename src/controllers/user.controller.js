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

async function update(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const user = await userService.updateUser(req.params.id, req.user.id, { name, email, password });
    return res.status(200).json({ user: user.toJSON() });
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    await userService.deleteUser(req.params.id, req.user.id);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = { create, getMe, update, remove };
