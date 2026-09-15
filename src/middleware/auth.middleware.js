const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Protege rotas exigindo um Bearer token JWT valido no header Authorization.
 * Em caso de sucesso, popula req.user com { id, role }.
 */
function authenticate(req, res, next) {
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
    req.user = { id: decoded.sub, role: decoded.role };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido ou expirado' });
  }
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

module.exports = { authenticate, authorize };
