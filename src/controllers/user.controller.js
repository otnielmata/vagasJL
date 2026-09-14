const userService = require('../services/user.service');

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

module.exports = { getMe };
