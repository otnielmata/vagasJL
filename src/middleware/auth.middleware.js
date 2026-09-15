const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/user.model');
const connectDB = require('../config/db');

/**
 * Protege rotas exigindo um Bearer token JWT valido no header Authorization.
 * Em caso de sucesso, popula req.user com { id, role }.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token de autenticacao ausente' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    if (typeof decoded.sub !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.sub)) {
      return res.status(401).json({ message: 'Token invalido ou expirado' });
    }
    req.user = { id: decoded.sub.toLowerCase(), role: decoded.role };
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido ou expirado' });
  }
  return next();
}

async function authenticateAccount(req, res, next, deleting = false) {
  try {
    await connectDB();
    const user = await User.findById(req.user.id).select('status role');
    if (!user) {
      const repeatedDeletion = deleting && req.params.id.toLowerCase() === req.user.id;
      return res.status(repeatedDeletion ? 404 : 401).json({
        message: repeatedDeletion ? 'Usuario nao encontrado' : 'Token invalido ou usuario inativo',
      });
    }
    if (user.status !== 'active') {
      return res.status(401).json({ message: 'Token invalido ou usuario inativo' });
    }
    req.user.role = user.role;
    return next();
  } catch (error) {
    return next(error);
  }
}

function authenticate(req, res, next) {
  return verifyToken(req, res, () => authenticateAccount(req, res, next));
}

function authenticateDeletion(req, res, next) {
  return verifyToken(req, res, () => authenticateAccount(req, res, next, true));
}

/**
 * Restringe o acesso a determinados papeis (roles). Deve ser usado apos authenticate.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso negado para este perfil de usuario' });
    }
    return next();
  };
}

module.exports = { authenticate, authenticateDeletion, authorize };
