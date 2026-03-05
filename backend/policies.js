export const ROLE_PERMISSIONS = Object.freeze({
  superadmin: ['*'],
  admin: [
    'ops:read',
    'users:read',
    'users:create',
    'users:approve',
    'users:deactivate',
    'users:activate',
    'users:update',
    'users:access',
    'users:delete',
    'options:delete',
    'tasks:create',
    'atendimentos:create',
    'atendimentos:delete',
  ],
  gestor: [
    'users:read',
    'users:create',
    'users:approve',
    'users:deactivate',
    'users:activate',
    'users:update',
    'options:delete',
    'tasks:create',
    'atendimentos:create',
    'atendimentos:delete',
  ],
  operador: [
    'atendimentos:create',
  ],
});

export function getUserPermissions(user) {
  if (!user?.role) return new Set();
  return new Set(ROLE_PERMISSIONS[user.role] || []);
}
