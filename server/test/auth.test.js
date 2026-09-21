import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  sanitizeUser,
} from '../src/services/authService.js';
import { store } from '../src/data/store.js';
import { authenticate, requireRole } from '../src/middleware/auth.js';

describe('authService', () => {
  it('hashes and compares passwords accurately', () => {
    const raw = 'SecretPassword123!';
    const hashed = hashPassword(raw);
    assert.notEqual(raw, hashed);
    assert.ok(comparePassword(raw, hashed));
    assert.equal(comparePassword('WrongPassword', hashed), false);
    assert.equal(comparePassword('', hashed), false);
    assert.equal(comparePassword(raw, null), false);
  });

  it('generates valid JWT and verifies decoded payload', () => {
    const user = {
      id: 'usr-test-1',
      email: 'test@sentinel.sec',
      role: 'ANALYST',
      name: 'Test Analyst',
    };
    const token = generateToken(user);
    assert.ok(typeof token === 'string' && token.length > 20);

    const decoded = verifyToken(token);
    assert.ok(decoded);
    assert.equal(decoded.id, user.id);
    assert.equal(decoded.email, user.email);
    assert.equal(decoded.role, user.role);
    assert.equal(decoded.name, user.name);
  });

  it('rejects tampered or malformed tokens', () => {
    assert.equal(verifyToken('not-a-token'), null);
    assert.equal(verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bad.signature'), null);
    assert.equal(verifyToken(null), null);
  });

  it('sanitizes user object by stripping passwordHash', () => {
    const user = {
      id: 'usr-1',
      name: 'Admin',
      email: 'admin@sec',
      passwordHash: '$2a$10$xyz',
      role: 'ADMIN',
    };
    const safe = sanitizeUser(user);
    assert.equal(safe.passwordHash, undefined);
    assert.equal(safe.id, 'usr-1');
    assert.equal(safe.email, 'admin@sec');
  });
});

describe('store user operations', () => {
  beforeEach(() => {
    store.reset();
  });

  it('finds seeded users by email (case-insensitive)', () => {
    const admin = store.findUserByEmail('ADMIN@SENTINEL.SEC');
    assert.ok(admin);
    assert.equal(admin.role, 'ADMIN');
    assert.equal(admin.email, 'admin@sentinel.sec');

    const missing = store.findUserByEmail('nobody@domain.com');
    assert.equal(missing, null);
  });

  it('creates new user and preserves active status', () => {
    const user = store.createUser({
      name: 'Kavindu Analyst',
      email: 'kavindu@sentinel.sec',
      role: 'ANALYST',
      passwordHash: hashPassword('KavinduSecret1!'),
    });

    assert.ok(user.id.startsWith('usr-'));
    assert.equal(user.status, 'ACTIVE');

    const found = store.findUserById(user.id);
    assert.equal(found.email, 'kavindu@sentinel.sec');
  });

  it('lists users without password hashes', () => {
    const users = store.listUsers();
    assert.ok(users.length >= 3);
    for (const u of users) {
      assert.equal(u.passwordHash, undefined);
      assert.ok(u.id);
      assert.ok(u.role);
    }
  });
});

describe('auth & RBAC middleware', () => {
  beforeEach(() => {
    store.reset();
  });

  it('rejects unauthenticated requests', () => {
    let statusCode = null;
    let jsonBody = null;

    const req = { headers: {} };
    const res = {
      status(c) {
        statusCode = c;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };
    let calledNext = false;
    const next = () => {
      calledNext = true;
    };

    authenticate(req, res, next);
    assert.equal(calledNext, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody.ok, false);
  });

  it('accepts valid bearer token and attaches req.user', () => {
    const admin = store.findUserByEmail('admin@sentinel.sec');
    const token = generateToken(admin);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {};
    let calledNext = false;
    const next = () => {
      calledNext = true;
    };

    authenticate(req, res, next);
    assert.equal(calledNext, true);
    assert.ok(req.user);
    assert.equal(req.user.id, admin.id);
    assert.equal(req.user.role, 'ADMIN');
  });

  it('requireRole allows permitted role and forbids insufficient role', () => {
    const guard = requireRole(['ADMIN']);

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(c) {
        statusCode = c;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };

    // Case 1: Analyst attempting ADMIN action
    let analystCalled = false;
    const analystReq = { user: { role: 'ANALYST', id: 'usr-2' } };
    guard(analystReq, res, () => {
      analystCalled = true;
    });
    assert.equal(analystCalled, false);
    assert.equal(statusCode, 403);
    assert.ok(jsonBody.error.includes('Requires one of [ADMIN]'));

    // Case 2: Admin attempting ADMIN action
    let adminCalled = false;
    const adminReq = { user: { role: 'ADMIN', id: 'usr-1' } };
    guard(adminReq, res, () => {
      adminCalled = true;
    });
    assert.equal(adminCalled, true);
  });
});
