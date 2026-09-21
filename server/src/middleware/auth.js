import { verifyToken, sanitizeUser } from '../services/authService.js';
import { store } from '../data/store.js';

/**
 * Authentication middleware.
 * Expects Bearer token in the Authorization header.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Missing or malformed authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid or expired session token' });
  }

  const user = store.findUserById(decoded.id);
  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ ok: false, error: 'Unauthorized: User account is inactive or not found' });
  }

  req.user = sanitizeUser(user);
  next();
}

/**
 * Optional authentication middleware:
 * Attaches user to req.user if token is present and valid, but does not reject request.
 */
export function optionalAuthenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      const user = store.findUserById(decoded.id);
      if (user && user.status === 'ACTIVE') {
        req.user = sanitizeUser(user);
      }
    }
  }
  next();
}

/**
 * Role-based access control guard.
 * @param {string[] | string} allowedRoles e.g. ['ADMIN', 'ANALYST']
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: `Forbidden: Requires one of [${roles.join(', ')}] privileges. Your role is ${req.user.role}.`,
      });
    }

    next();
  };
}
