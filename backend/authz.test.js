import test from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from './authz.js';

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
