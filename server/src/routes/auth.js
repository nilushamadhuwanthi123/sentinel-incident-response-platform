import express from 'express';
import { store } from '../data/store.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  sanitizeUser,
} from '../services/authService.js';
import { authenticate, optionalAuthenticate, requireRole } from '../middleware/auth.js';

export const authRouter = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ['ADMIN', 'ANALYST', 'VIEWER'];

/**
 * POST /api/auth/register
 * Register a new operational user.
 */
authRouter.post('/register', (req, res) => {
  const { email, password, name, role = 'ANALYST' } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email address is required' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters long' });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Name is required' });
  }

  const assignedRole = ALLOWED_ROLES.includes(role?.toUpperCase())
    ? role.toUpperCase()
    : 'ANALYST';

  const existing = store.findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ ok: false, error: 'User with this email already exists' });
  }

  const newUser = store.createUser({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashPassword(password),
    role: assignedRole,
  });

  store.createAuditLog({
    actor: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
    action: 'AUTH_REGISTER',
    resource: 'user',
    resourceId: newUser.id,
    metadata: { role: newUser.role },
  });

  const token = generateToken(newUser);

  res.status(201).json({
    ok: true,
    user: sanitizeUser(newUser),
    token,
  });
});

/**
 * POST /api/auth/login
 * Authenticate credentials and receive a JWT.
 */
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password are required' });
  }

  const user = store.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ ok: false, error: 'Account has been suspended or deactivated' });
  }

  const matches = comparePassword(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }

  const updatedUser = store.updateUser(user.id, {
    lastLogin: new Date().toISOString(),
  });

  store.createAuditLog({
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
    action: 'AUTH_LOGIN',
    resource: 'session',
    resourceId: user.id,
    metadata: { ip: req.ip || '127.0.0.1' },
  });

  const token = generateToken(updatedUser);

  res.json({
    ok: true,
    user: sanitizeUser(updatedUser),
    token,
  });
});

/**
 * GET /api/auth/me
 * Return profile of currently authenticated user.
 */
authRouter.get('/me', authenticate, (req, res) => {
  res.json({
    ok: true,
    user: req.user,
  });
});

/**
 * POST /api/auth/logout
 * Informational logout and audit logging.
 */
authRouter.post('/logout', optionalAuthenticate, (req, res) => {
  if (req.user) {
    store.createAuditLog({
      actor: req.user,
      action: 'AUTH_LOGOUT',
      resource: 'session',
      resourceId: req.user.id,
      metadata: {},
    });
  }
  res.json({ ok: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/users
 * List all users for incident assignment and admin oversight.
 */
authRouter.get('/users', authenticate, requireRole(['ADMIN', 'ANALYST']), (_req, res) => {
  res.json({
    ok: true,
    users: store.listUsers(),
  });
});

/**
 * POST /api/auth/switch
 * Quick role testing / session acquisition for operators.
 */
authRouter.post('/switch', (req, res) => {
  const { role = 'ANALYST' } = req.body || {};
  const targetRole = ALLOWED_ROLES.includes(role?.toUpperCase()) ? role.toUpperCase() : 'ANALYST';
  const emailMap = {
    ADMIN: 'admin@sentinel.sec',
    ANALYST: 'analyst@sentinel.sec',
    VIEWER: 'viewer@sentinel.sec',
  };
  const targetEmail = emailMap[targetRole] || 'admin@sentinel.sec';
  let user = store.findUserByEmail(targetEmail);
  if (!user) {
    user = store.listUsers().find((u) => u.role === targetRole) || store.listUsers()[0];
  }
  const token = generateToken(user);
  res.json({
    ok: true,
    user: sanitizeUser(user),
    token,
  });
});
