import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, requirePermission, requireRole } from './authz.js';

function createResMock() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('requireRole allows authorized role', () => {
  const middleware = requireRole('admin', 'gestor');
  const req = { user: { role: 'admin' } };
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('requireRole allows superadmin for any protected route', () => {
  const middleware = requireRole('gestor');
  const req = { user: { role: 'superadmin' } };
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('requireRole blocks unauthorized role', () => {
  const middleware = requireRole('admin');
  const req = { user: { role: 'operador' } };
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Acesso negado para este perfil.' });
});

test('requireRole blocks anonymous request', () => {
  const middleware = requireRole('admin');
  const req = {};
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('hasPermission returns true for role permission', () => {
  const allowed = hasPermission({ role: 'gestor' }, 'tasks:create');
  assert.equal(allowed, true);
});

test('requirePermission allows superadmin', () => {
  const middleware = requirePermission('users:delete');
  const req = { user: { role: 'superadmin' } };
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('requirePermission blocks role without permission', () => {
  const middleware = requirePermission('users:delete');
  const req = { user: { role: 'gestor' } };
  const res = createResMock();
  let called = false;

  middleware(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('permission matrix for critical actions', () => {
  const criticalPermissions = ['ops:read', 'users:access', 'users:delete', 'tasks:create', 'atendimentos:create'];

  const expectations = {
    superadmin: [true, true, true, true, true],
    admin: [true, true, true, true, true],
    gestor: [false, false, false, true, true],
    operador: [false, false, false, false, true],
  };

  Object.entries(expectations).forEach(([role, expected]) => {
    const actual = criticalPermissions.map((permission) => hasPermission({ role }, permission));
    assert.deepEqual(actual, expected, `permissões inválidas para role ${role}`);
  });
});
