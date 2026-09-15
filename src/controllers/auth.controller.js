const authService = require('../services/auth.service');

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const { user, token } = await authService.register({ name, email, password, role });

    return res.status(201).json({ user, token });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /login e /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user, token } = await authService.login({ email, password });

    return res.status(200).json({ user: user.toJSON(), token });
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, login };
