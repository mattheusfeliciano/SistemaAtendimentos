import { getUserPermissions } from './policies.js';

export function hasPermission(user, permission) {
  if (!user || !permission) return false;
  const permissions = getUserPermissions(user);
  return permissions.has('*') || permissions.has(permission);
}

export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    if (permissions.some((permission) => hasPermission(req.user, permission))) {
      return next();
    }
    return res.status(403).json({ error: 'Acesso negado para este perfil.' });
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    if (req.user.role === 'superadmin') {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    return next();
  };
}
