import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID, randomInt, createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { initDatabase, query } from './db.js';
import { requirePermission } from './authz.js';

const app = express();
const PORT = Number(process.env.API_PORT || 3001);
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 120);
const SESSION_ACTIVITY_UPDATE_MS = Number(process.env.SESSION_ACTIVITY_UPDATE_MS || 60 * 1000);
const COOKIE_NAME = 'auth_token';
const isProduction = process.env.NODE_ENV === 'production';
const enforceHttps = process.env.ENFORCE_HTTPS === 'true' || isProduction;

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';
const SECRETARY_FULL_NAME = process.env.SECRETARY_FULL_NAME || 'SECRETÁRIO';
const SECRETARY_EMAIL = (process.env.SECRETARY_EMAIL || 'secretario@sect.local').toLowerCase();
const SECRETARY_PASSWORD = process.env.SECRETARY_PASSWORD || 'Secretario@2026!';
const SECRETARY_DEPARTMENT = process.env.SECRETARY_DEPARTMENT || 'Secretaria de Educação';
const ROOT_ADMIN_ACCOUNT = Object.freeze({
  fullName: process.env.ROOT_ADMIN_FULL_NAME || 'ADMIN',
  email: (process.env.ROOT_ADMIN_EMAIL || 'admin@sect.local').toLowerCase(),
  password: process.env.ROOT_ADMIN_PASSWORD || 'Admin@2026!',
  department: process.env.ROOT_ADMIN_DEPARTMENT || 'Tecnologia da Informação',
});
const TERMS_VERSION = process.env.TERMS_VERSION || '2026-03-v1';
const PRIVACY_VERSION = process.env.PRIVACY_VERSION || '2026-03-v1';

const emailTransporter = SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const uploadsDir = path.resolve(__dirname, '../storage/task-attachments');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedTurnos = new Map([
  ['manha', 'Manhã'],
  ['tarde', 'Tarde'],
  ['noite', 'Noite'],
]);

const allowedRoles = new Set(['superadmin', 'admin', 'gestor', 'operador']);
const allowedOptionTypes = new Set(['departamento', 'local', 'atividade', 'responsavel']);
const attachmentAllowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const attachmentAllowedExtensions = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);
const securityAuditActions = new Set([
  'LOGIN_FAILED_UNKNOWN',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'UNLOCK_USER',
  'DEACTIVATE_USER',
  'SESSION_IDLE_EXPIRED',
]);
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER_NAME = 'x-csrf-guard';
const CSRF_HEADER_VALUE = '1';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCK_THRESHOLD = Number(process.env.ACCOUNT_LOCK_THRESHOLD || 5);
const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 30);
const loginPenaltyState = new Map();
const sseClients = new Map();
const COMMENT_KMS_ENABLED = process.env.COMMENT_KMS_ENABLED === 'true';
const COMMENT_CRYPTO_ROTATION_DAYS = Number(process.env.COMMENT_CRYPTO_ROTATION_DAYS || 30);
const COMMENT_CRYPTO_RETENTION_DAYS = Number(process.env.COMMENT_CRYPTO_RETENTION_DAYS || 120);
const COMMENT_CRYPTO_MAINTENANCE_MS = Number(process.env.COMMENT_CRYPTO_MAINTENANCE_MS || 6 * 60 * 60 * 1000);
let commentKeyringCache = [];
let commentCryptoMaintenanceTimer;
const taskPresenceState = new Map();
const taskTypingState = new Map();
const opsMetrics = {
  startedAt: Date.now(),
  apiRequests: 0,
  apiByStatus: {},
  apiByRoute: {},
  lastErrors: [],
};

const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = String(file.originalname || 'arquivo')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
    },
  }),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const mimetype = String(file.mimetype || '').toLowerCase();
    if (!attachmentAllowedExtensions.has(extension)) {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
      return;
    }
    if (!attachmentAllowedMimeTypes.has(mimetype) && mimetype !== 'application/octet-stream') {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
      return;
    }
    cb(null, true);
  },
});

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

function sanitize(value) {
  return String(value).replace(/[<>]/g, '').trim();
}

function isExplicitlyAccepted(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeOrigin(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    return new URL(candidate).origin;
  } catch (_error) {
    return '';
  }
}

function normalizeComparable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRoleValue(value) {
  return String(value || '').trim().toLowerCase();
}

function maskEmail(value) {
  const raw = String(value || '').trim();
  if (!raw.includes('@')) return '***';
  const [local, domain] = raw.split('@');
  const localMasked =
    local.length <= 2
      ? `${local[0] || '*'}*`
      : `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}`;
  const domainParts = String(domain || '').split('.');
  const domainName = domainParts[0] || '';
  const tld = domainParts.slice(1).join('.') || '***';
  const domainMasked = domainName.length <= 2 ? `${domainName[0] || '*'}*` : `${domainName.slice(0, 2)}***`;
  return `${localMasked}@${domainMasked}.${tld}`;
}

function isStoredLocalAttachment(url) {
  const value = String(url || '').trim();
  return value.startsWith('local:') || value.startsWith('/uploads/task-attachments/');
}

function getStoredAttachmentFileName(url) {
  const value = String(url || '').trim();
  if (value.startsWith('local:')) {
    return path.basename(value.slice('local:'.length));
  }
  if (value.startsWith('/uploads/task-attachments/')) {
    return path.basename(value.slice('/uploads/task-attachments/'.length));
  }
  return '';
}

function getAttachmentAccessUrl(attachmentId) {
  return `/api/tasks/attachments/${attachmentId}/download`;
}

function hashToken(value) {
  return createHash('sha256').update(value).digest('hex');
}

function getCommentCipherKey() {
  const rawKeys = String(process.env.COMMENT_CRYPTO_KEYS || '').trim();
  if (rawKeys) {
    const parsed = rawKeys
      .split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [id, secret] = chunk.split(':');
        return id && secret ? { id: id.trim(), key: createHash('sha256').update(secret.trim()).digest(), source: 'env' } : null;
      })
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  const fallback = process.env.COMMENT_CRYPTO_KEY || process.env.SECRETARY_PASSWORD || 'dash-educacao-comment-key';
  return [{ id: 'default', key: createHash('sha256').update(String(fallback)).digest(), source: 'fallback' }];
}

function getKmsMasterKey() {
  const seed = String(process.env.COMMENT_KMS_MASTER_KEY || process.env.SECRETARY_PASSWORD || 'dash-educacao-kms-master');
  return createHash('sha256').update(seed).digest();
}

function kmsWrapDataKey(rawKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKmsMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `kms:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function kmsUnwrapDataKey(payload) {
  const raw = String(payload || '');
  if (!raw.startsWith('kms:v1:')) throw new Error('Formato de chave KMS inválido.');
  const [, , ivB64, tagB64, dataB64] = raw.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', getKmsMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

async function reloadCommentKeyringCache() {
  if (!COMMENT_KMS_ENABLED) {
    commentKeyringCache = [];
    return;
  }
  const rows = await query(
    `
      SELECT id, wrapped_key AS "wrappedKey", is_active AS "isActive", created_at AS "createdAt"
      FROM comment_crypto_keys
      WHERE purged_at IS NULL
      ORDER BY is_active DESC, created_at DESC
    `
  );

  const next = [];
  for (const row of rows.rows) {
    try {
      next.push({
        id: row.id,
        key: kmsUnwrapDataKey(row.wrappedKey),
        source: 'kms',
        isActive: row.isActive,
        createdAt: row.createdAt,
      });
    } catch (error) {
      console.error(`Falha ao descriptografar chave de comentário ${row.id}:`, error.message);
    }
  }
  commentKeyringCache = next;
}

function getRuntimeCommentKeys() {
  if (commentKeyringCache.length > 0) return commentKeyringCache;
  return getCommentCipherKey();
}

function encryptCommentWithKey(message, keyEntry) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyEntry.key, iv);
  const encrypted = Buffer.concat([cipher.update(String(message), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v2:${keyEntry.id}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function encryptCommentMessage(message) {
  const keys = getRuntimeCommentKeys();
  const active = keys[0];
  return encryptCommentWithKey(message, active);
}

function decryptCommentMessage(payload) {
  const raw = String(payload || '');
  const keys = getRuntimeCommentKeys();
  if (raw.startsWith('enc:v2:')) {
    try {
      const [, , keyId, ivB64, tagB64, dataB64] = raw.split(':');
      const preferred = keys.find((item) => item.id === keyId);
      const candidates = preferred ? [preferred, ...keys.filter((item) => item.id !== keyId)] : keys;
      for (const candidate of candidates) {
        try {
          const iv = Buffer.from(ivB64, 'base64');
          const tag = Buffer.from(tagB64, 'base64');
          const encrypted = Buffer.from(dataB64, 'base64');
          const decipher = createDecipheriv('aes-256-gcm', candidate.key, iv);
          decipher.setAuthTag(tag);
          const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
          return decrypted.toString('utf8');
        } catch (_candidateError) {
          // tenta próxima chave
        }
      }
      return '[mensagem indisponível]';
    } catch (_error) {
      return '[mensagem indisponível]';
    }
  }
  if (!raw.startsWith('enc:v1:')) return raw;
  try {
    const [, , ivB64, tagB64, dataB64] = raw.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', keys[0].key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_error) {
    return '[mensagem indisponível]';
  }
}

function generateVerificationCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function isStrongPassword(value) {
  if (value.length < 8) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  if (!/[^A-Za-z0-9]/.test(value)) return false;
  return true;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null; 
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  const firstPart = digits.length === 11 ? digits.slice(2, 7) : digits.slice(2, 6);
  const secondPart = digits.slice(digits.length === 11 ? 7 : 6);
  return `(${ddd}) ${firstPart}-${secondPart}`;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
}

function normalizeTurno(value) {
  const normalized = sanitize(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  return allowedTurnos.get(normalized) || null;
}

function normalizeOptionValue(value) {
  return sanitize(value).toLowerCase().replace(/\s+/g, ' ');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function getLoginPenaltyKey(req) {
  const ip = normalizeIp(getClientIp(req));
  const email = sanitize(req.body?.email || '').toLowerCase();
  return `${ip}|${email || 'unknown'}`;
}

function getLoginPenaltyDurationMs(strikes) {
  if (strikes < 5) return 0;
  const multiplier = Math.min(2 ** (strikes - 5), 12);
  return 15 * 60 * 1000 * multiplier;
}

function registerFailedLoginAttempt(req) {
  const key = getLoginPenaltyKey(req);
  const now = Date.now();
  const current = loginPenaltyState.get(key) || { strikes: 0, blockedUntil: 0 };
  const nextStrikes = current.strikes + 1;
  const penaltyMs = getLoginPenaltyDurationMs(nextStrikes);
  const blockedUntil = penaltyMs > 0 ? now + penaltyMs : current.blockedUntil;
  loginPenaltyState.set(key, { strikes: nextStrikes, blockedUntil });
}

function clearLoginPenalty(req) {
  loginPenaltyState.delete(getLoginPenaltyKey(req));
}

function loginProgressiveBlock(req, res, next) {
  const key = getLoginPenaltyKey(req);
  const state = loginPenaltyState.get(key);
  const now = Date.now();
  if (state?.blockedUntil && state.blockedUntil > now) {
    const retryAfterSec = Math.ceil((state.blockedUntil - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' });
  }
  if (state?.blockedUntil && state.blockedUntil <= now) {
    loginPenaltyState.delete(key);
  }
  return next();
}

function requireHttps(req, res, next) {
  if (!enforceHttps) return next();
  const proto = req.headers['x-forwarded-proto'];
  const secureProxy = typeof proto === 'string' && proto.includes('https');
  if (!req.secure && !secureProxy) {
    return res.status(426).json({ error: 'HTTPS obrigatorio para este ambiente.' });
  }
  return next();
}

async function auditLog({ req, userId = null, action, entity, entityId = null, details = null }) {
  try {
    await query(
      `
        INSERT INTO audit_logs (id, user_id, action, entity, entity_id, ip_address, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        randomUUID(),
        userId,
        action,
        entity,
        entityId,
        normalizeIp(getClientIp(req)),
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    console.error('Falha ao registrar auditoria:', error);
  }
}

function isSecretaryRole(user) {
  return !!user && (user.role === 'superadmin' || user.role === 'admin' || user.role === 'gestor');
}

function isSecretaryUser(user) {
  if (!user) return false;
  return normalizeComparable(user.fullName) === normalizeComparable(SECRETARY_FULL_NAME);
}

function isRootAdmin(user) {
  return !!user && user.role === 'superadmin';
}

function sanitizeUserForViewer(viewer, targetUser) {
  if (!targetUser) return targetUser;
  const isViewerRoot = isRootAdmin(viewer);
  const sanitized = {
    ...targetUser,
    role: normalizeRoleValue(targetUser.role),
    approvedBy: isViewerRoot ? targetUser.approvedBy : null,
    approvedByName: isViewerRoot ? targetUser.approvedByName : null,
  };
  if (targetUser.role !== 'superadmin' || isViewerRoot) {
    return sanitized;
  }
  return {
    ...sanitized,
    email: maskEmail(targetUser.email),
    phone: null,
    department: 'Acesso restrito',
  };
}

function canAccessSecretaryPanel(user) {
  return isSecretaryUser(user) || isRootAdmin(user);
}

function requireSecretaryAccess(req, res, next) {
  if (!canAccessSecretaryPanel(req.user)) {
    return res.status(403).json({ error: 'Acesso permitido apenas ao secretário ou admin TI.' });
  }
  return next();
}

function normalizeTaskPriority(value) {
  const normalized = sanitize(value || '').toLowerCase();
  if (normalized === 'baixa' || normalized === 'media' || normalized === 'alta') return normalized;
  return 'media';
}

function normalizeTaskStatus(value) {
  const normalized = sanitize(value || '').toLowerCase();
  if (normalized === 'pendente' || normalized === 'em_andamento' || normalized === 'concluida' || normalized === 'atrasada') return normalized;
  return null;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

async function createNotificationsForUsers(users, payload) {
  const uniqueUserIds = Array.from(new Set(users.filter(Boolean)));
  for (const userId of uniqueUserIds) {
    await query(
      `
        INSERT INTO notifications (id, user_id, title, message, kind, related_entity, related_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        randomUUID(),
        userId,
        payload.title,
        payload.message,
        payload.kind || 'info',
        payload.relatedEntity || null,
        payload.relatedId || null,
      ]
    );
    pushRealtimeEvent(userId, {
      type: 'notification:new',
      payload: {
        title: payload.title,
        message: payload.message,
        relatedEntity: payload.relatedEntity || null,
        relatedId: payload.relatedId || null,
      },
    });
  }
}

async function getRootAdminUserIds() {
  const result = await query(
    `
      SELECT id::text AS id
      FROM users
      WHERE role = 'superadmin'
        AND is_active = TRUE
        AND approved_at IS NOT NULL
    `
  );
  return result.rows.map((row) => row.id);
}

async function createSecurityAlert({ title, message, relatedEntity = 'security', relatedId = null }) {
  const recipients = await getRootAdminUserIds();
  if (recipients.length === 0) return;
  await createNotificationsForUsers(recipients, {
    title,
    message,
    kind: 'warning',
    relatedEntity,
    relatedId,
  });
}

function toCsvCell(value) {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function pushRealtimeEvent(userId, event) {
  const clients = sseClients.get(userId) || [];
  if (clients.length === 0) return;
  const data = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  clients.forEach((res) => res.write(data));
}

function readMentionTokens(message) {
  const regex = /@([\p{L}0-9._-]{2,64})/gu;
  const tokens = new Set();
  let match;
  while ((match = regex.exec(String(message || ''))) !== null) {
    tokens.add(normalizeComparable(match[1]).replace(/\s+/g, ''));
  }
  return Array.from(tokens);
}

async function resolveMentionedUserIds(message) {
  const tokens = readMentionTokens(message);
  if (tokens.length === 0) return [];

  const users = await query(
    `
      SELECT id::text AS id, full_name AS "fullName", email
      FROM users
      WHERE is_active = TRUE
    `
  );

  const ids = new Set();
  for (const user of users.rows) {
    const full = normalizeComparable(user.fullName || '');
    const compact = full.replace(/\s+/g, '');
    const firstName = (full.split(' ')[0] || compact).replace(/\s+/g, '');
    const emailLocal = normalizeComparable(String(user.email || '').split('@')[0]).replace(/\s+/g, '');
    for (const token of tokens) {
      if (token === compact || token === firstName || token === emailLocal) {
        ids.add(user.id);
      }
    }
  }
  return Array.from(ids);
}

function cleanupTaskRealtimeMaps() {
  const now = Date.now();
  const presenceMaxAge = 90 * 1000;
  const typingMaxAge = 20 * 1000;

  for (const [taskId, usersMap] of taskPresenceState.entries()) {
    for (const [userId, value] of usersMap.entries()) {
      if (now - value.updatedAt > presenceMaxAge) usersMap.delete(userId);
    }
    if (usersMap.size === 0) taskPresenceState.delete(taskId);
  }

  for (const [taskId, usersMap] of taskTypingState.entries()) {
    for (const [userId, value] of usersMap.entries()) {
      if (now - value.updatedAt > typingMaxAge) usersMap.delete(userId);
    }
    if (usersMap.size === 0) taskTypingState.delete(taskId);
  }
}

function getTaskOnlineUsers(taskId) {
  cleanupTaskRealtimeMaps();
  const map = taskPresenceState.get(taskId) || new Map();
  return Array.from(map.values()).map((item) => ({
    userId: item.userId,
    userName: item.userName,
  }));
}

async function getTaskRealtimeRecipients(taskId) {
  const result = await query(
    `
      SELECT DISTINCT user_id::text AS id
      FROM (
        SELECT ta.user_id
        FROM task_assignees ta
        WHERE ta.task_id = $1
        UNION
        SELECT t.created_by AS user_id
        FROM tasks t
        WHERE t.id = $1
        UNION
        SELECT tm.user_id
        FROM tasks t
        JOIN team_members tm ON tm.team_id = t.team_id
        WHERE t.id = $1
      ) users_union
      WHERE user_id IS NOT NULL
    `,
    [taskId]
  );
  return result.rows.map((row) => row.id);
}

async function maintainCommentCryptoKeyring() {
  if (!COMMENT_KMS_ENABLED) {
    commentKeyringCache = [];
    return;
  }

  const now = new Date();
  const allKeys = await query(
    `
      SELECT id, wrapped_key AS "wrappedKey", is_active AS "isActive", created_at AS "createdAt", purge_after AS "purgeAfter", purged_at AS "purgedAt"
      FROM comment_crypto_keys
      ORDER BY created_at DESC
    `
  );

  if (allKeys.rowCount === 0) {
    const keyId = `kms-${Date.now().toString(36)}`;
    await query(
      `
        INSERT INTO comment_crypto_keys (id, wrapped_key, is_active)
        VALUES ($1, $2, TRUE)
      `,
      [keyId, kmsWrapDataKey(randomBytes(32))]
    );
  }

  const activeResult = await query(
    `
      SELECT id, created_at AS "createdAt"
      FROM comment_crypto_keys
      WHERE is_active = TRUE AND purged_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  let activeKeyId = activeResult.rows[0]?.id || null;
  if (!activeKeyId) {
    const keyId = `kms-${Date.now().toString(36)}`;
    await query('UPDATE comment_crypto_keys SET is_active = FALSE WHERE is_active = TRUE');
    await query(
      `
        INSERT INTO comment_crypto_keys (id, wrapped_key, is_active)
        VALUES ($1, $2, TRUE)
      `,
      [keyId, kmsWrapDataKey(randomBytes(32))]
    );
    activeKeyId = keyId;
  }

  const activeCreatedAt = new Date(activeResult.rows[0]?.createdAt || now.toISOString());
  const daysSinceRotation = Math.floor((now.getTime() - activeCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceRotation >= COMMENT_CRYPTO_ROTATION_DAYS) {
    const newKeyId = `kms-${Date.now().toString(36)}`;
    const purgeAfter = new Date(now);
    purgeAfter.setDate(purgeAfter.getDate() + COMMENT_CRYPTO_RETENTION_DAYS);
    await query(
      `
        UPDATE comment_crypto_keys
        SET is_active = FALSE, retired_at = NOW(), purge_after = $2
        WHERE id = $1
      `,
      [activeKeyId, purgeAfter.toISOString()]
    );
    await query(
      `
        INSERT INTO comment_crypto_keys (id, wrapped_key, is_active)
        VALUES ($1, $2, TRUE)
      `,
      [newKeyId, kmsWrapDataKey(randomBytes(32))]
    );
    activeKeyId = newKeyId;
  }

  await reloadCommentKeyringCache();

  const expirable = await query(
    `
      SELECT id
      FROM comment_crypto_keys
      WHERE is_active = FALSE
        AND purged_at IS NULL
        AND purge_after IS NOT NULL
        AND purge_after <= NOW()
    `
  );

  for (const row of expirable.rows) {
    const keyId = row.id;
    const encryptedRows = await query(
      `
        SELECT id::text AS id, message
        FROM task_comments
        WHERE message LIKE $1
      `,
      [`enc:v2:${keyId}:%`]
    );

    if (encryptedRows.rowCount > 0 && commentKeyringCache.length > 0) {
      const activeKey = commentKeyringCache[0];
      let hasMigrationFailure = false;
      for (const comment of encryptedRows.rows) {
        const plaintext = decryptCommentMessage(comment.message);
        if (plaintext === '[mensagem indisponível]') {
          hasMigrationFailure = true;
          continue;
        }
        await query('UPDATE task_comments SET message = $2 WHERE id = $1', [comment.id, encryptCommentWithKey(plaintext, activeKey)]);
      }
      if (hasMigrationFailure) {
        console.error(`Expurgo adiado para chave ${keyId}: há mensagens não migradas.`);
        continue;
      }
    }

    await query(
      `
        UPDATE comment_crypto_keys
        SET wrapped_key = '[purged]', purged_at = NOW()
        WHERE id = $1
      `,
      [keyId]
    );
  }

  await reloadCommentKeyringCache();
}

async function canAccessTask(taskId, user) {
  if (isSecretaryRole(user)) return true;

  const result = await query(
    `
      SELECT t.id
      FROM tasks t
      LEFT JOIN task_assignees ta ON ta.task_id = t.id
      LEFT JOIN team_members tm ON tm.team_id = t.team_id
      WHERE t.id = $1 AND (ta.user_id = $2 OR tm.user_id = $2)
      LIMIT 1
    `,
    [taskId, user.id]
  );

  return result.rowCount > 0;
}

async function appendTaskEvent({ taskId, userId = null, eventType, message, metadata = null }) {
  await query(
    `
      INSERT INTO task_events (id, task_id, user_id, event_type, message, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [randomUUID(), taskId, userId, eventType, message, metadata ? JSON.stringify(metadata) : null]
  );
}

function computeSlaStatus({ createdAt, completedAt, status, slaDays }) {
  if (!slaDays || slaDays <= 0) return 'sem_sla';

  const startedAt = new Date(createdAt);
  const expectedDeadline = new Date(startedAt);
  expectedDeadline.setDate(expectedDeadline.getDate() + slaDays);

  if (status === 'concluida' && completedAt) {
    return new Date(completedAt) <= expectedDeadline ? 'no_prazo' : 'violado';
  }

  const now = new Date();
  if (now > expectedDeadline) return 'violado';
  const riskDate = new Date(expectedDeadline);
  riskDate.setDate(riskDate.getDate() - 1);
  if (now >= riskDate) return 'em_risco';
  return 'no_prazo';
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * SESSION_HOURS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  });
}

async function revokeSessionToken(rawToken) {
  if (!rawToken) return;
  await query(
    'UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(rawToken)]
  );
}

async function createSession(user, req) {
  const rawToken = `${randomUUID()}-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * SESSION_HOURS);

  await query(
    `
      INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, last_activity_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    `,
    [
      randomUUID(),
      user.id,
      hashToken(rawToken),
      normalizeIp(getClientIp(req)),
      sanitize(req.headers['user-agent'] || ''),
      expiresAt.toISOString(),
    ]
  );

  return rawToken;
}

async function createAndSendVerificationCode(user) {
  const code = generateVerificationCode();
  const tokenHash = hashToken(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);

  await query(
    `
      INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [randomUUID(), user.id, tokenHash, expiresAt.toISOString()]
  );

  if (emailTransporter) {
    await emailTransporter.sendMail({
      from: SMTP_FROM,
      to: user.email,
      subject: 'Código de verificação - Dashboard Educação',
      text: `Olá, ${user.fullName}.\n\nSeu código é: ${code}\nValidade: 15 minutos.`,
    });
  } else if (!isProduction) {
    console.log(`Código de verificação (dev) para ${user.email}: ${code}`);
  }

  return code;
}

function buildAtendimentoPayload(body) {
  const { data, turno, departamento, atividade, responsavel, local } = body ?? {};

  if (!data || !turno || !departamento || !atividade || !responsavel || !local) {
    return { error: 'Dados inválidos ou incompletos.' };
  }

  const sanitizedData = sanitize(data);
  if (!isValidIsoDate(sanitizedData)) {
    return { error: 'Data inválida. Use o formato YYYY-MM-DD.' };
  }

  const normalizedTurno = normalizeTurno(turno);
  if (!normalizedTurno) {
    return { error: 'Turno inválido. Valores permitidos: Manhã, Tarde, Noite.' };
  }

  return {
    data: sanitizedData,
    turno: normalizedTurno,
    departamento: sanitize(departamento),
    atividade: sanitize(atividade),
    responsavel: sanitize(responsavel),
    local: sanitize(local),
  };
}

async function authenticate(req, res, next) {
  const rawToken = req.cookies[COOKIE_NAME];
  if (!rawToken) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  try {
    const result = await query(
      `
        SELECT
          s.id::text AS "sessionId",
          s.user_id::text AS "userId",
          s.last_activity_at AS "lastActivityAt",
          s.expires_at AS "expiresAt",
          u.full_name AS "fullName",
          u.email,
          u.role,
          u.department,
          u.is_active AS "isActive",
          u.email_verified_at AS "emailVerifiedAt",
          u.approved_at AS "approvedAt"
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
        LIMIT 1
      `,
      [hashToken(rawToken)]
    );

    if (result.rowCount === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const session = result.rows[0];
    session.role = normalizeRoleValue(session.role);
    const lastActivityAtMs = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : Date.now();
    const idleTimeoutMs = SESSION_IDLE_MINUTES * 60 * 1000;
    const idleForMs = Date.now() - lastActivityAtMs;
    if (idleTimeoutMs > 0 && idleForMs > idleTimeoutMs) {
      clearSessionCookie(res);
      await query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1::uuid AND revoked_at IS NULL', [session.sessionId]);
      await auditLog({
        req,
        userId: session.userId,
        action: 'SESSION_IDLE_EXPIRED',
        entity: 'auth',
        entityId: session.userId,
        details: { idleMinutes: Math.floor(idleForMs / 60000), limitMinutes: SESSION_IDLE_MINUTES },
      });
      return res.status(401).json({ error: 'Sessão expirada por inatividade. Faça login novamente.' });
    }

    if (!session.isActive) {
      clearSessionCookie(res);
      await revokeSessionToken(rawToken);
      return res.status(403).json({ error: 'Usuário desativado.' });
    }

    req.user = {
      id: session.userId,
      fullName: session.fullName,
      email: session.email,
      role: session.role,
      department: session.department,
      emailVerifiedAt: session.emailVerifiedAt,
      approvedAt: session.approvedAt,
      sessionId: session.sessionId,
      rawToken,
    };

    if (idleForMs >= SESSION_ACTIVITY_UPDATE_MS) {
      await query('UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1::uuid AND revoked_at IS NULL', [session.sessionId]);
    }

    return next();
  } catch (error) {
    console.error('Erro ao autenticar sessão:', error);
    clearSessionCookie(res);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

const configuredOrigins = [
  ...(process.env.FRONTEND_URL || '').split(','),
  ...(process.env.FRONTEND_URLS || '').split(','),
].map(normalizeOrigin).filter(Boolean);
const developmentOrigins = isProduction
  ? []
  : [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
const allowedOrigins = Array.from(new Set([...configuredOrigins, ...developmentOrigins]));
const cspConnectSources = ["'self'", ...allowedOrigins];
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: cspConnectSources,
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  })
);
app.use(requireHttps);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Acesso negado por política de CORS'));
    },
  })
);

const loginIpRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

const loginIdentityRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getLoginPenaltyKey(req),
  message: { error: 'Muitas tentativas para este usuário. Aguarde e tente novamente.' },
});

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use('/uploads', (_req, res) => res.status(404).json({ error: 'Acesso direto ao diretório de uploads está desativado.' }));
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const statusKey = String(res.statusCode);
    const routeKey = `${req.method} ${req.path}`;
    opsMetrics.apiRequests += 1;
    opsMetrics.apiByStatus[statusKey] = (opsMetrics.apiByStatus[statusKey] || 0) + 1;
    opsMetrics.apiByRoute[routeKey] = (opsMetrics.apiByRoute[routeKey] || 0) + 1;
    if (durationMs > 2500) {
      opsMetrics.lastErrors.unshift({
        type: 'slow_request',
        route: routeKey,
        status: res.statusCode,
        durationMs,
        at: new Date().toISOString(),
      });
      opsMetrics.lastErrors = opsMetrics.lastErrors.slice(0, 60);
    }
  });
  return next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (SAFE_HTTP_METHODS.has(req.method)) return next();

  const csrfHeader = String(req.headers[CSRF_HEADER_NAME] || '');
  if (csrfHeader !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ error: 'Falha de proteção CSRF.' });
  }

  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();
  const originAllowed = origin && allowedOrigins.includes(origin);
  const refererAllowed = referer && allowedOrigins.some((allowedOrigin) => referer.startsWith(`${allowedOrigin}/`) || referer === allowedOrigin);
  if (!originAllowed && !refererAllowed) {
    return res.status(403).json({ error: 'Origem inválida para operação de escrita.' });
  }

  return next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ ok: true, service: 'atendimentos-api', database: 'postgres' });
  } catch (error) {
    return res.status(503).json({ ok: false, service: 'atendimentos-api', database: 'unavailable' });
  }
});

app.get('/api/ops/metrics', authenticate, requirePermission('ops:read'), async (_req, res) => {
  return res.json({
    uptimeSeconds: Math.floor((Date.now() - opsMetrics.startedAt) / 1000),
    apiRequests: opsMetrics.apiRequests,
    apiByStatus: opsMetrics.apiByStatus,
    apiByRoute: opsMetrics.apiByRoute,
    lastErrors: opsMetrics.lastErrors,
  });
});

app.get('/api/audit-logs', authenticate, requirePermission('ops:read'), async (req, res) => {
  const action = sanitize(req.query?.action || '').toUpperCase();
  const entity = sanitize(req.query?.entity || '').toLowerCase();
  const userId = sanitize(req.query?.userId || '');
  const dateFrom = sanitize(req.query?.dateFrom || '');
  const dateTo = sanitize(req.query?.dateTo || '');
  const securityOnly = String(req.query?.securityOnly || '').toLowerCase() === 'true';
  const page = Math.max(1, Number(req.query?.page || 1));
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit || 100)));
  const offset = (page - 1) * limit;

  try {
    const where = [];
    const params = [];
    if (action) {
      params.push(action);
      where.push(`l.action = $${params.length}`);
    }
    if (entity) {
      params.push(entity);
      where.push(`l.entity = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      where.push(`l.user_id::text = $${params.length}`);
    }
    if (dateFrom && isValidIsoDate(dateFrom)) {
      params.push(`${dateFrom}T00:00:00.000Z`);
      where.push(`l.created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo && isValidIsoDate(dateTo)) {
      params.push(`${dateTo}T23:59:59.999Z`);
      where.push(`l.created_at <= $${params.length}::timestamptz`);
    }
    if (securityOnly) {
      params.push(Array.from(securityAuditActions));
      where.push(`l.action = ANY($${params.length}::text[])`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await query(`SELECT COUNT(*)::int AS total FROM audit_logs l ${whereClause}`, params);

    const pagedParams = [...params, limit, offset];
    const dataResult = await query(
      `
        SELECT
          l.id::text AS id,
          l.user_id::text AS "userId",
          COALESCE(u.full_name, 'Sistema') AS "userName",
          l.action,
          l.entity,
          l.entity_id AS "entityId",
          l.ip_address AS "ipAddress",
          l.details,
          l.created_at AS "createdAt"
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT $${pagedParams.length - 1}
        OFFSET $${pagedParams.length}
      `,
      pagedParams
    );

    return res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar logs de auditoria:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/audit-logs/export.csv', authenticate, requirePermission('ops:read'), async (req, res) => {
  const action = sanitize(req.query?.action || '').toUpperCase();
  const entity = sanitize(req.query?.entity || '').toLowerCase();
  const userId = sanitize(req.query?.userId || '');
  const dateFrom = sanitize(req.query?.dateFrom || '');
  const dateTo = sanitize(req.query?.dateTo || '');
  const securityOnly = String(req.query?.securityOnly || '').toLowerCase() === 'true';
  const limit = Math.min(5000, Math.max(1, Number(req.query?.limit || 2000)));

  try {
    const where = [];
    const params = [];
    if (action) {
      params.push(action);
      where.push(`l.action = $${params.length}`);
    }
    if (entity) {
      params.push(entity);
      where.push(`l.entity = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      where.push(`l.user_id::text = $${params.length}`);
    }
    if (dateFrom && isValidIsoDate(dateFrom)) {
      params.push(`${dateFrom}T00:00:00.000Z`);
      where.push(`l.created_at >= $${params.length}::timestamptz`);
    }
    if (dateTo && isValidIsoDate(dateTo)) {
      params.push(`${dateTo}T23:59:59.999Z`);
      where.push(`l.created_at <= $${params.length}::timestamptz`);
    }
    if (securityOnly) {
      params.push(Array.from(securityAuditActions));
      where.push(`l.action = ANY($${params.length}::text[])`);
    }
    params.push(limit);

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `
        SELECT
          l.created_at AS "createdAt",
          COALESCE(u.full_name, 'Sistema') AS "userName",
          l.user_id::text AS "userId",
          l.action,
          l.entity,
          l.entity_id AS "entityId",
          l.ip_address AS "ipAddress",
          COALESCE(l.details::text, '') AS details
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    const header = ['createdAt', 'userName', 'userId', 'action', 'entity', 'entityId', 'ipAddress', 'details'];
    const lines = [header.join(',')];
    result.rows.forEach((row) => {
      lines.push([
        toCsvCell(row.createdAt),
        toCsvCell(row.userName),
        toCsvCell(row.userId),
        toCsvCell(row.action),
        toCsvCell(row.entity),
        toCsvCell(row.entityId),
        toCsvCell(row.ipAddress),
        toCsvCell(row.details),
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    console.error('Erro ao exportar logs de auditoria:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const fullName = sanitize(req.body?.fullName || '');
  const email = sanitize(req.body?.email || '').toLowerCase();
  const password = String(req.body?.password || '');
  const department = sanitize(req.body?.department || '');
  const phone = normalizePhone(req.body?.phone || '');
  const termsAccepted = isExplicitlyAccepted(req.body?.termsAccepted);
  const privacyAccepted = isExplicitlyAccepted(req.body?.privacyAccepted);

  if (fullName.length < 5) return res.status(400).json({ error: 'Nome completo inválido.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Senha fraca.' });
  if (department.length < 2) return res.status(400).json({ error: 'Setor obrigatório.' });
  if (String(req.body?.phone || '').trim() && !phone) {
    return res.status(400).json({ error: 'Telefone inválido. Use DDD + número.' });
  }
  if (!termsAccepted || !privacyAccepted) {
    return res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade.' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount > 0) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `
        INSERT INTO users (id, name, full_name, email, password_hash, role, department, phone, is_active, email_verified_at, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
        VALUES ($1, $2, $3, $4, $5, 'operador', $6, $7, FALSE, NOW(), NOW(), NOW(), $8, $9)
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, phone, is_active AS "isActive", email_verified_at AS "emailVerifiedAt", approved_at AS "approvedAt", created_at AS "createdAt"
      `,
      [id, fullName, fullName, email, passwordHash, department, phone, TERMS_VERSION, PRIVACY_VERSION]
    );

    const user = result.rows[0];

    await auditLog({
      req,
      userId: user.id,
      action: 'SELF_REGISTER',
      entity: 'user',
      entityId: user.id,
      details: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });

    return res.status(201).json({
      user,
      message: 'Cadastro solicitado com sucesso. Agora aguarde aprovação do gestor responsável.',
    });
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/auth/verify-email/request', async (req, res) => {
  return res.status(410).json({ error: 'Verificação de e-mail desativada neste sistema.' });
});

app.post('/api/auth/verify-email/confirm', async (req, res) => {
  return res.status(410).json({ error: 'Verificação de e-mail desativada neste sistema.' });
});

app.post('/api/auth/login', loginIpRateLimiter, loginIdentityRateLimiter, loginProgressiveBlock, async (req, res) => {
  const email = sanitize(req.body?.email || '').toLowerCase();
  const password = String(req.body?.password || '');
  const termsAccepted = isExplicitlyAccepted(req.body?.termsAccepted);
  const privacyAccepted = isExplicitlyAccepted(req.body?.privacyAccepted);

  if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
    registerFailedLoginAttempt(req);
    return res.status(400).json({ error: 'Credenciais inválidas.' });
  }
  if (!termsAccepted || !privacyAccepted) {
    return res.status(400).json({ error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para entrar.' });
  }

  try {
    const result = await query(
      `
        SELECT
          id::text AS id,
          full_name AS "fullName",
          email,
          role,
          department,
          phone,
          is_active AS "isActive",
          email_verified_at AS "emailVerifiedAt",
          approved_at AS "approvedAt",
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          password_hash AS "passwordHash",
          created_at AS "createdAt"
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      registerFailedLoginAttempt(req);
      await auditLog({
        req,
        action: 'LOGIN_FAILED_UNKNOWN',
        entity: 'auth',
        entityId: email || 'unknown',
      });
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const user = result.rows[0];
    user.role = normalizeRoleValue(user.role);
    const now = Date.now();
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
      const retryAfterSec = Math.ceil((new Date(user.lockedUntil).getTime() - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      await auditLog({
        req,
        userId: user.id,
        action: 'LOGIN_BLOCKED',
        entity: 'auth',
        entityId: user.id,
        details: { lockedUntil: user.lockedUntil },
      });
      await createSecurityAlert({
        title: 'Conta bloqueada por tentativas inválidas',
        message: `Usuário ${user.fullName} (${maskEmail(user.email)}) tentou autenticar durante bloqueio ativo.`,
        relatedEntity: 'user',
        relatedId: user.id,
      });
      return res.status(423).json({ error: 'Conta temporariamente bloqueada por tentativas inválidas. Tente novamente mais tarde.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Usuário desativado.' });
    }

    if (!user.approvedAt) {
      return res.status(403).json({ error: 'Usuário pendente de aprovação do gestor responsável.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      registerFailedLoginAttempt(req);
      const failedState = await query(
        `
          UPDATE users
          SET
            failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
            locked_until = CASE
              WHEN COALESCE(failed_login_attempts, 0) + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
              ELSE locked_until
            END
          WHERE id = $1::uuid
          RETURNING failed_login_attempts AS "failedLoginAttempts", locked_until AS "lockedUntil"
        `,
        [user.id, ACCOUNT_LOCK_THRESHOLD, ACCOUNT_LOCK_MINUTES]
      );
      const failed = failedState.rows[0] || { failedLoginAttempts: 0, lockedUntil: null };
      await auditLog({
        req,
        userId: user.id,
        action: 'LOGIN_FAILED',
        entity: 'auth',
        entityId: user.id,
        details: { failedLoginAttempts: failed.failedLoginAttempts, lockedUntil: failed.lockedUntil },
      });
      if (failed.failedLoginAttempts >= 3) {
        await createSecurityAlert({
          title: 'Múltiplos logins falhos detectados',
          message: `Usuário ${user.fullName} (${maskEmail(user.email)}) acumulou ${failed.failedLoginAttempts} tentativas de login falhas.`,
          relatedEntity: 'user',
          relatedId: user.id,
        });
      }
      if (failed.lockedUntil && new Date(failed.lockedUntil).getTime() > Date.now()) {
        return res.status(423).json({ error: 'Conta temporariamente bloqueada por tentativas inválidas. Tente novamente mais tarde.' });
      }
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    clearLoginPenalty(req);

    await query(
      `
        UPDATE users
        SET
          terms_accepted_at = NOW(),
          privacy_accepted_at = NOW(),
          terms_version = $2,
          privacy_version = $3,
          failed_login_attempts = 0,
          locked_until = NULL
        WHERE id = $1::uuid
      `,
      [user.id, TERMS_VERSION, PRIVACY_VERSION]
    );

    await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
    const sessionToken = await createSession(user, req);
    setSessionCookie(res, sessionToken);

    await auditLog({ req, userId: user.id, action: 'LOGIN', entity: 'auth', entityId: user.id });

    return res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        emailVerifiedAt: user.emailVerifiedAt,
        approvedAt: user.approvedAt,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Erro ao autenticar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await revokeSessionToken(req.user.rawToken);
  clearSessionCookie(res);
  await auditLog({ req, userId: req.user.id, action: 'LOGOUT', entity: 'auth', entityId: req.user.id });
  return res.status(204).send();
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      email: req.user.email,
      role: req.user.role,
      department: req.user.department,
      emailVerifiedAt: req.user.emailVerifiedAt,
      approvedAt: req.user.approvedAt,
    },
  });
});

app.get('/api/options', authenticate, async (req, res) => {
  const type = sanitize(req.query?.type || '').toLowerCase();
  if (type && !allowedOptionTypes.has(type)) {
    return res.status(400).json({ error: 'Tipo de opção inválido.' });
  }

  const params = [];
  const where = type ? 'WHERE type = $1' : '';
  if (type) params.push(type);

  const result = await query(
    `
      SELECT
        id::text AS id,
        type,
        value,
        created_at AS "createdAt"
      FROM catalog_options
      ${where}
      ORDER BY type ASC, value ASC
    `,
    params
  );

  return res.json(result.rows);
});

app.post('/api/options', authenticate, async (req, res) => {
  const type = sanitize(req.body?.type || '').toLowerCase();
  const value = sanitize(req.body?.value || '').toUpperCase();
  if (!allowedOptionTypes.has(type)) {
    return res.status(400).json({ error: 'Tipo de opção inválido.' });
  }
  if (value.length < 2) {
    return res.status(400).json({ error: 'Valor da opção é obrigatório.' });
  }

  const normalizedValue = normalizeOptionValue(value);

  try {
    const result = await query(
      `
        INSERT INTO catalog_options (id, type, value, normalized_value, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (type, normalized_value) DO UPDATE
          SET value = EXCLUDED.value
        RETURNING id::text AS id, type, value, created_at AS "createdAt"
      `,
      [randomUUID(), type, value, normalizedValue, req.user.id]
    );

    await auditLog({
      req,
      userId: req.user.id,
      action: 'CREATE_OPTION',
      entity: 'catalog_option',
      entityId: result.rows[0].id,
      details: { type, value },
    });

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar opção de catálogo:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/options/:id', authenticate, async (req, res) => {
  const value = sanitize(req.body?.value || '').toUpperCase();
  if (value.length < 2) {
    return res.status(400).json({ error: 'Valor da opção é obrigatório.' });
  }

  const normalizedValue = normalizeOptionValue(value);

  try {
    const existing = await query(
      'SELECT id::text AS id, type FROM catalog_options WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Opção não encontrada.' });

    const optionType = existing.rows[0].type;
    const duplicate = await query(
      'SELECT id FROM catalog_options WHERE type = $1 AND normalized_value = $2 AND id <> $3 LIMIT 1',
      [optionType, normalizedValue, req.params.id]
    );
    if (duplicate.rowCount > 0) {
      return res.status(409).json({ error: 'Já existe uma opção com este valor.' });
    }

    const result = await query(
      `
        UPDATE catalog_options
        SET value = $2, normalized_value = $3
        WHERE id = $1
        RETURNING id::text AS id, type, value, created_at AS "createdAt"
      `,
      [req.params.id, value, normalizedValue]
    );

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_OPTION',
      entity: 'catalog_option',
      entityId: req.params.id,
      details: { value },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar opção de catálogo:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/options/:id', authenticate, requirePermission('options:delete'), async (req, res) => {
  try {
    const result = await query('DELETE FROM catalog_options WHERE id = $1 RETURNING id::text AS id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Opção não encontrada.' });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'DELETE_OPTION',
      entity: 'catalog_option',
      entityId: req.params.id,
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao remover opção de catálogo:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/users', authenticate, requirePermission('users:read'), async (req, res) => {
  try {
    const isSecretary = isSecretaryUser(req.user);
    const isGestor = req.user.role === 'gestor';
    const whereClause = isGestor ? `WHERE role = 'operador'` : isSecretary ? `WHERE role NOT IN ('admin', 'superadmin')` : '';
    const result = await query(
      `
        SELECT
          id::text AS id,
          full_name AS "fullName",
          email,
          role,
          department,
          phone,
          is_active AS "isActive",
          email_verified_at AS "emailVerifiedAt",
          approved_at AS "approvedAt",
          approved_by::text AS "approvedBy",
          approver.full_name AS "approvedByName",
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          created_at AS "createdAt"
        FROM users
        LEFT JOIN users approver ON approver.id = users.approved_by
        ${whereClause}
        ORDER BY users.created_at DESC
      `
    );
    return res.json(result.rows.map((row) => sanitizeUserForViewer(req.user, row)));
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/users', authenticate, requirePermission('users:create'), async (req, res) => {
  const fullName = sanitize(req.body?.fullName || '');
  const email = sanitize(req.body?.email || '').toLowerCase();
  const password = String(req.body?.password || '');
  const department = sanitize(req.body?.department || '');
  const role = sanitize(req.body?.role || 'operador').toLowerCase();
  const phone = normalizePhone(req.body?.phone || '');

  if (fullName.length < 5) return res.status(400).json({ error: 'Nome completo inválido.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (!isStrongPassword(password)) return res.status(400).json({ error: 'Senha fraca.' });
  if (department.length < 2) return res.status(400).json({ error: 'Setor obrigatório.' });
  if (!allowedRoles.has(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  if (String(req.body?.phone || '').trim() && !phone) {
    return res.status(400).json({ error: 'Telefone inválido. Use DDD + número.' });
  }
  if (role === 'superadmin') {
    return res.status(403).json({ error: 'Este sistema permite apenas um superusuário fixo.' });
  }
  if (req.user.role === 'gestor' && role !== 'operador') {
    return res.status(403).json({ error: 'Gestor só pode criar usuários operadores.' });
  }
  if (!isRootAdmin(req.user) && (role === 'admin' || role === 'superadmin')) {
    return res.status(403).json({ error: 'Apenas o ADMIN pode criar perfis administrativos.' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount > 0) return res.status(409).json({ error: 'E-mail já cadastrado.' });

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `
        INSERT INTO users (id, name, full_name, email, password_hash, role, department, phone, is_active, email_verified_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NOW())
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, phone, is_active AS "isActive", email_verified_at AS "emailVerifiedAt", approved_at AS "approvedAt", created_at AS "createdAt"
      `,
      [id, fullName, fullName, email, passwordHash, role, department, phone]
    );

    const user = result.rows[0];

    await auditLog({ req, userId: req.user.id, action: 'CREATE_USER', entity: 'user', entityId: user.id, details: { role: user.role } });

    return res.status(201).json({
      user,
      message: 'Usuário criado. Pendente de aprovação.',
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id/approve', authenticate, requirePermission('users:approve'), async (req, res) => {
  try {
    const roleResult = await query('SELECT role FROM users WHERE id = $1 LIMIT 1', [req.params.id]);
    if (roleResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!isRootAdmin(req.user) && roleResult.rows[0].role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode aprovar outro ADMIN.' });
    }

    if (req.user.role === 'gestor') {
      if (roleResult.rows[0].role !== 'operador') {
        return res.status(403).json({ error: 'Gestor só pode aprovar usuários operadores.' });
      }
    } else if (isSecretaryUser(req.user) && (roleResult.rows[0].role === 'admin' || roleResult.rows[0].role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode aprovar usuários administrativos.' });
    }

    const result = await query(
      `
        UPDATE users
        SET is_active = TRUE, approved_at = NOW(), approved_by = $2
        WHERE id = $1
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, is_active AS "isActive", approved_at AS "approvedAt"
      `,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await auditLog({ req, userId: req.user.id, action: 'APPROVE_USER', entity: 'user', entityId: req.params.id });
    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao aprovar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id/deactivate', authenticate, requirePermission('users:deactivate'), async (req, res) => {
  try {
    const roleResult = await query('SELECT role FROM users WHERE id = $1 LIMIT 1', [req.params.id]);
    if (roleResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!isRootAdmin(req.user) && roleResult.rows[0].role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode desativar outro ADMIN.' });
    }

    if (req.user.role === 'gestor') {
      if (roleResult.rows[0].role !== 'operador') {
        return res.status(403).json({ error: 'Gestor só pode desativar usuários operadores.' });
      }
    } else if (isSecretaryUser(req.user) && (roleResult.rows[0].role === 'admin' || roleResult.rows[0].role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode desativar usuários administrativos.' });
    }

    const result = await query(
      `
        UPDATE users
        SET is_active = FALSE
        WHERE id = $1
        RETURNING id::text AS id, full_name AS "fullName", email, is_active AS "isActive"
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.params.id]);

    await auditLog({ req, userId: req.user.id, action: 'DEACTIVATE_USER', entity: 'user', entityId: req.params.id });
    await createSecurityAlert({
      title: 'Usuário desativado',
      message: `${req.user.fullName} desativou o usuário ${result.rows[0].fullName}.`,
      relatedEntity: 'user',
      relatedId: req.params.id,
    });
    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao desativar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id/activate', authenticate, requirePermission('users:activate'), async (req, res) => {
  try {
    const roleResult = await query('SELECT role FROM users WHERE id = $1 LIMIT 1', [req.params.id]);
    if (roleResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!isRootAdmin(req.user) && roleResult.rows[0].role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode ativar outro ADMIN.' });
    }

    if (req.user.role === 'gestor') {
      if (roleResult.rows[0].role !== 'operador') {
        return res.status(403).json({ error: 'Gestor só pode ativar usuários operadores.' });
      }
    } else if (isSecretaryUser(req.user) && (roleResult.rows[0].role === 'admin' || roleResult.rows[0].role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode ativar usuários administrativos.' });
    }

    const result = await query(
      `
        UPDATE users
        SET is_active = TRUE, approved_at = COALESCE(approved_at, NOW()), approved_by = COALESCE(approved_by, $2)
        WHERE id = $1
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, phone, is_active AS "isActive", email_verified_at AS "emailVerifiedAt", approved_at AS "approvedAt", approved_by::text AS "approvedBy", created_at AS "createdAt"
      `,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await auditLog({ req, userId: req.user.id, action: 'ACTIVATE_USER', entity: 'user', entityId: req.params.id });
    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao ativar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id/unlock', authenticate, requirePermission('users:activate'), async (req, res) => {
  try {
    const roleResult = await query('SELECT role FROM users WHERE id = $1 LIMIT 1', [req.params.id]);
    if (roleResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!isRootAdmin(req.user) && roleResult.rows[0].role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode desbloquear outro ADMIN.' });
    }

    if (req.user.role === 'gestor') {
      if (roleResult.rows[0].role !== 'operador') {
        return res.status(403).json({ error: 'Gestor só pode desbloquear usuários operadores.' });
      }
    } else if (isSecretaryUser(req.user) && (roleResult.rows[0].role === 'admin' || roleResult.rows[0].role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode desbloquear usuários administrativos.' });
    }

    const result = await query(
      `
        UPDATE users
        SET failed_login_attempts = 0, locked_until = NULL
        WHERE id = $1
        RETURNING
          id::text AS id,
          full_name AS "fullName",
          email,
          role,
          department,
          phone,
          is_active AS "isActive",
          email_verified_at AS "emailVerifiedAt",
          approved_at AS "approvedAt",
          approved_by::text AS "approvedBy",
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          created_at AS "createdAt"
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await auditLog({ req, userId: req.user.id, action: 'UNLOCK_USER', entity: 'user', entityId: req.params.id });
    await createSecurityAlert({
      title: 'Desbloqueio manual de conta',
      message: `${req.user.fullName} desbloqueou manualmente o usuário ${result.rows[0].fullName}.`,
      relatedEntity: 'user',
      relatedId: req.params.id,
    });
    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao desbloquear usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id', authenticate, requirePermission('users:update'), async (req, res) => {
  const userId = req.params.id;
  const updates = {};
  const changes = {};

  try {
    const existingResult = await query(
      `
        SELECT
          id::text AS id,
          full_name AS "fullName",
          email,
          role,
          department,
          phone,
          email_verified_at AS "emailVerifiedAt"
        FROM users
        WHERE users.id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (existingResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const existing = existingResult.rows[0];
    const isGestor = req.user.role === 'gestor';
    const isSecretary = isSecretaryUser(req.user);
    if (!isRootAdmin(req.user) && existing.role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode editar outro ADMIN.' });
    }

    if (isGestor && existing.role !== 'operador') {
      return res.status(403).json({ error: 'Gestor só pode editar usuários operadores.' });
    }
    if (isSecretary && (existing.role === 'admin' || existing.role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode editar usuários administrativos.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) {
      const fullName = sanitize(req.body?.fullName || '');
      if (fullName.length < 5) return res.status(400).json({ error: 'Nome completo inválido.' });
      updates.full_name = fullName;
      updates.name = fullName;
      changes.fullName = fullName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'department')) {
      const department = sanitize(req.body?.department || '');
      if (department.length < 2) return res.status(400).json({ error: 'Setor obrigatório.' });
      updates.department = department;
      changes.department = department;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      const phoneInput = String(req.body?.phone || '');
      const phone = normalizePhone(phoneInput);
      if (phoneInput.trim() && !phone) {
        return res.status(400).json({ error: 'Telefone inválido. Use DDD + número.' });
      }
      updates.phone = phone;
      changes.phone = phone;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const email = sanitize(req.body?.email || '').toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });

      const duplicate = await query('SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1', [email, userId]);
      if (duplicate.rowCount > 0) return res.status(409).json({ error: 'E-mail já cadastrado.' });

      updates.email = email;
      changes.email = email;

    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      const role = sanitize(req.body?.role || '').toLowerCase();
      if (!allowedRoles.has(role)) return res.status(400).json({ error: 'Perfil inválido.' });
      if (role === 'superadmin') {
        return res.status(403).json({ error: 'Este sistema permite apenas um superusuário fixo.' });
      }

      if (isGestor && role !== 'operador') {
        return res.status(403).json({ error: 'Gestor não pode promover perfil acima de operador.' });
      }
      if (!isRootAdmin(req.user) && (role === 'admin' || role === 'superadmin')) {
        return res.status(403).json({ error: 'Apenas o ADMIN pode promover para perfis administrativos.' });
      }

      updates.role = role;
      changes.role = role;
    }

    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualização.' });
    }

    const setClause = updateKeys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = updateKeys.map((key) => updates[key]);

    const result = await query(
      `
        UPDATE users
        SET ${setClause}
        WHERE id = $1
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, phone, is_active AS "isActive", email_verified_at AS "emailVerifiedAt", approved_at AS "approvedAt", approved_by::text AS "approvedBy", created_at AS "createdAt"
      `,
      [userId, ...values]
    );

    if (Object.prototype.hasOwnProperty.call(updates, 'role') && updates.role !== existing.role) {
      await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_USER',
      entity: 'user',
      entityId: userId,
      details: changes,
    });

    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/users/:id/access', authenticate, requirePermission('users:access'), async (req, res) => {
  if (!isRootAdmin(req.user)) {
    return res.status(403).json({ error: 'Apenas o ADMIN pode alterar acesso administrativo.' });
  }
  const role = sanitize(req.body?.role || '').toLowerCase();
  if (!allowedRoles.has(role)) return res.status(400).json({ error: 'Perfil inválido.' });
  if (role === 'superadmin') {
    return res.status(403).json({ error: 'Este sistema permite apenas um superusuário fixo.' });
  }
  if (req.params.id === req.user.id) {
    return res.status(403).json({ error: 'Não é permitido alterar o próprio perfil de acesso.' });
  }

  try {
    const result = await query(
      `
        UPDATE users
        SET role = $2
        WHERE id = $1
        RETURNING id::text AS id, full_name AS "fullName", email, role, department, phone, is_active AS "isActive", email_verified_at AS "emailVerifiedAt", approved_at AS "approvedAt", approved_by::text AS "approvedBy", created_at AS "createdAt"
      `,
      [req.params.id, role]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.params.id]);

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_USER_ACCESS',
      entity: 'user',
      entityId: req.params.id,
      details: { role },
    });

    return res.json(sanitizeUserForViewer(req.user, result.rows[0]));
  } catch (error) {
    console.error('Erro ao atualizar perfil do usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/users/:id', authenticate, requirePermission('users:delete'), async (req, res) => {
  const userId = req.params.id;

  if (userId === req.user.id) {
    return res.status(403).json({ error: 'Não é permitido excluir o próprio usuário logado.' });
  }

  try {
    const existing = await query(
      `
        SELECT id::text AS id, full_name AS "fullName", email, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (existing.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!isRootAdmin(req.user) && existing.rows[0].role === 'superadmin') {
      return res.status(403).json({ error: 'Apenas o ADMIN pode excluir outro ADMIN.' });
    }
    if (isSecretaryUser(req.user) && (existing.rows[0].role === 'admin' || existing.rows[0].role === 'superadmin')) {
      return res.status(403).json({ error: 'Secretário não pode excluir usuários administrativos.' });
    }

    await query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);

    await auditLog({
      req,
      userId: req.user.id,
      action: 'DELETE_USER',
      entity: 'user',
      entityId: userId,
      details: existing.rows[0],
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id::text AS id,
          title,
          message,
          kind,
          related_entity AS "relatedEntity",
          related_id AS "relatedId",
          read_at AS "readAt",
          created_at AS "createdAt"
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const result = await query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id::text AS id, read_at AS "readAt"
      `,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notificação não encontrada.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/events', authenticate, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userId = req.user.id;
  const clients = sseClients.get(userId) || [];
  clients.push(res);
  sseClients.set(userId, clients);

  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, ts: new Date().toISOString() })}\n\n`);
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const current = sseClients.get(userId) || [];
    sseClients.set(
      userId,
      current.filter((client) => client !== res)
    );
  });
});

app.get('/api/teams', authenticate, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          t.id::text AS id,
          t.name,
          COALESCE(t.description, '') AS description,
          t.created_at AS "createdAt",
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', u.id::text,
                'fullName', u.full_name,
                'email', u.email
              )
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'::json
          ) AS members
        FROM teams t
        LEFT JOIN team_members tm ON tm.team_id = t.id
        LEFT JOIN users u ON u.id = tm.user_id
        ${isSecretaryRole(req.user) ? '' : 'WHERE tm.user_id = $1'}
        GROUP BY t.id, t.name, t.description, t.created_at
        ORDER BY t.name ASC
      `,
      isSecretaryRole(req.user) ? [] : [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar equipes:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/teams', authenticate, requireSecretaryAccess, async (req, res) => {
  const name = sanitize(req.body?.name || '');
  const description = sanitize(req.body?.description || '');
  const memberIds = Array.isArray(req.body?.memberIds)
    ? req.body.memberIds.map((value) => sanitize(value)).filter(Boolean)
    : [];

  if (name.length < 3) return res.status(400).json({ error: 'Nome da equipe inválido.' });

  try {
    const teamId = randomUUID();
    await query(
      `
        INSERT INTO teams (id, name, description, created_by)
        VALUES ($1, $2, $3, $4)
      `,
      [teamId, name, description || null, req.user.id]
    );

    if (memberIds.length > 0) {
      for (const userId of Array.from(new Set(memberIds))) {
        await query(
          `
            INSERT INTO team_members (team_id, user_id, added_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (team_id, user_id) DO NOTHING
          `,
          [teamId, userId, req.user.id]
        );
      }

      await createNotificationsForUsers(memberIds, {
        title: `Você entrou na equipe ${name}`,
        message: 'Uma nova equipe foi criada pelo secretário e você foi incluído.',
        kind: 'team',
        relatedEntity: 'team',
        relatedId: teamId,
      });
    }

    await auditLog({
      req,
      userId: req.user.id,
      action: 'CREATE_TEAM',
      entity: 'team',
      entityId: teamId,
      details: { members: memberIds.length },
    });

    return res.status(201).json({ id: teamId, name, description });
  } catch (error) {
    console.error('Erro ao criar equipe:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/teams/:id', authenticate, requireSecretaryAccess, async (req, res) => {
  const name = sanitize(req.body?.name || '');
  const description = sanitize(req.body?.description || '');

  if (name.length < 3) return res.status(400).json({ error: 'Nome da equipe inválido.' });

  try {
    const result = await query(
      `
        UPDATE teams
        SET name = $2, description = $3
        WHERE id = $1
        RETURNING id::text AS id, name, COALESCE(description, '') AS description
      `,
      [req.params.id, name, description || null]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Equipe não encontrada.' });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_TEAM',
      entity: 'team',
      entityId: req.params.id,
      details: { name },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao editar equipe:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.put('/api/teams/:id/members', authenticate, requireSecretaryAccess, async (req, res) => {
  const memberIds = Array.isArray(req.body?.memberIds)
    ? Array.from(new Set(req.body.memberIds.map((value) => sanitize(value)).filter(Boolean)))
    : [];

  try {
    const teamResult = await query('SELECT id::text AS id, name FROM teams WHERE id = $1 LIMIT 1', [req.params.id]);
    if (teamResult.rowCount === 0) return res.status(404).json({ error: 'Equipe não encontrada.' });

    await query('DELETE FROM team_members WHERE team_id = $1', [req.params.id]);
    for (const userId of memberIds) {
      await query(
        `
          INSERT INTO team_members (team_id, user_id, added_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (team_id, user_id) DO NOTHING
        `,
        [req.params.id, userId, req.user.id]
      );
    }

    await createNotificationsForUsers(memberIds, {
      title: `Você foi vinculado à equipe ${teamResult.rows[0].name}`,
      message: 'O secretário atualizou os membros desta equipe.',
      kind: 'team',
      relatedEntity: 'team',
      relatedId: req.params.id,
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_TEAM_MEMBERS',
      entity: 'team',
      entityId: req.params.id,
      details: { members: memberIds.length },
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao atualizar membros da equipe:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/teams/:id', authenticate, requireSecretaryAccess, async (req, res) => {
  try {
    const existing = await query('SELECT id::text AS id, name FROM teams WHERE id = $1 LIMIT 1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Equipe não encontrada.' });

    await query('DELETE FROM teams WHERE id = $1', [req.params.id]);

    await auditLog({
      req,
      userId: req.user.id,
      action: 'DELETE_TEAM',
      entity: 'team',
      entityId: req.params.id,
      details: { name: existing.rows[0].name },
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir equipe:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/teams/:id/message', authenticate, requireSecretaryAccess, async (req, res) => {
  const title = sanitize(req.body?.title || 'Mensagem da Secretaria');
  const message = sanitize(req.body?.message || '');

  if (message.length < 2) return res.status(400).json({ error: 'Mensagem inválida.' });

  try {
    const teamResult = await query('SELECT id::text AS id, name FROM teams WHERE id = $1 LIMIT 1', [req.params.id]);
    if (teamResult.rowCount === 0) return res.status(404).json({ error: 'Equipe não encontrada.' });

    const membersResult = await query('SELECT user_id::text AS id FROM team_members WHERE team_id = $1', [req.params.id]);
    const userIds = membersResult.rows.map((row) => row.id);

    await createNotificationsForUsers(userIds, {
      title,
      message,
      kind: 'broadcast',
      relatedEntity: 'team',
      relatedId: req.params.id,
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'SEND_TEAM_MESSAGE',
      entity: 'team',
      entityId: req.params.id,
      details: { recipients: userIds.length },
    });

    return res.status(201).json({ sent: userIds.length, team: teamResult.rows[0].name });
  } catch (error) {
    console.error('Erro ao enviar mensagem para equipe:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/notifications/broadcast', authenticate, requireSecretaryAccess, async (req, res) => {
  const title = sanitize(req.body?.title || 'Mensagem da Secretaria');
  const message = sanitize(req.body?.message || '');
  const userIds = Array.isArray(req.body?.userIds)
    ? Array.from(new Set(req.body.userIds.map((value) => sanitize(value)).filter(Boolean)))
    : [];

  if (message.length < 2) return res.status(400).json({ error: 'Mensagem inválida.' });
  if (userIds.length === 0) return res.status(400).json({ error: 'Selecione ao menos um responsável.' });

  try {
    const recipientsResult = await query(
      `
        SELECT id::text AS id
        FROM users
        WHERE id::text = ANY($1::text[]) AND is_active = TRUE
      `,
      [userIds]
    );
    const recipientIds = recipientsResult.rows.map((row) => row.id);

    await createNotificationsForUsers(recipientIds, {
      title,
      message,
      kind: 'broadcast',
      relatedEntity: 'user',
      relatedId: null,
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'SEND_USER_BROADCAST',
      entity: 'notification',
      entityId: null,
      details: { recipients: recipientIds.length },
    });

    return res.status(201).json({ sent: recipientIds.length, recipients: recipientIds });
  } catch (error) {
    console.error('Erro ao enviar mensagem por responsáveis:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/task-sla-profiles', authenticate, async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT type, sla_days AS "slaDays", is_active AS "isActive"
        FROM task_sla_profiles
        ORDER BY sla_days ASC, type ASC
      `
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar perfis de SLA:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/task-templates', authenticate, async (_req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id::text AS id,
          title,
          COALESCE(description, '') AS description,
          priority,
          task_type AS "taskType",
          COALESCE(goal_target, '') AS "goalTarget",
          default_due_days AS "defaultDueDays",
          created_by::text AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM task_templates
        ORDER BY updated_at DESC, title ASC
      `
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar templates de atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/task-templates', authenticate, requireSecretaryAccess, async (req, res) => {
  const title = sanitize(req.body?.title || '');
  const description = sanitize(req.body?.description || '');
  const taskType = sanitize(req.body?.taskType || 'administrativo').toLowerCase();
  const priority = normalizeTaskPriority(req.body?.priority || 'media');
  const goalTarget = sanitize(req.body?.goalTarget || '');
  const defaultDueDays = Number(req.body?.defaultDueDays || 7);

  if (title.length < 3) return res.status(400).json({ error: 'Título do template inválido.' });
  if (!Number.isFinite(defaultDueDays) || defaultDueDays < 1 || defaultDueDays > 365) {
    return res.status(400).json({ error: 'Prazo padrão inválido (1-365 dias).' });
  }

  try {
    const templateId = randomUUID();
    const result = await query(
      `
        INSERT INTO task_templates (id, title, description, priority, task_type, goal_target, default_due_days, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id::text AS id,
          title,
          COALESCE(description, '') AS description,
          priority,
          task_type AS "taskType",
          COALESCE(goal_target, '') AS "goalTarget",
          default_due_days AS "defaultDueDays",
          created_by::text AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [templateId, title, description || null, priority, taskType, goalTarget || null, defaultDueDays, req.user.id]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar template de atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/task-templates/:id', authenticate, requireSecretaryAccess, async (req, res) => {
  const title = sanitize(req.body?.title || '');
  const description = sanitize(req.body?.description || '');
  const taskType = sanitize(req.body?.taskType || 'administrativo').toLowerCase();
  const priority = normalizeTaskPriority(req.body?.priority || 'media');
  const goalTarget = sanitize(req.body?.goalTarget || '');
  const defaultDueDays = Number(req.body?.defaultDueDays || 7);

  if (title.length < 3) return res.status(400).json({ error: 'Título do template inválido.' });
  if (!Number.isFinite(defaultDueDays) || defaultDueDays < 1 || defaultDueDays > 365) {
    return res.status(400).json({ error: 'Prazo padrão inválido (1-365 dias).' });
  }

  try {
    const result = await query(
      `
        UPDATE task_templates
        SET
          title = $2,
          description = $3,
          priority = $4,
          task_type = $5,
          goal_target = $6,
          default_due_days = $7,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id::text AS id,
          title,
          COALESCE(description, '') AS description,
          priority,
          task_type AS "taskType",
          COALESCE(goal_target, '') AS "goalTarget",
          default_due_days AS "defaultDueDays",
          created_by::text AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [req.params.id, title, description || null, priority, taskType, goalTarget || null, defaultDueDays]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Template não encontrado.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar template de atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/task-templates/:id', authenticate, requireSecretaryAccess, async (req, res) => {
  try {
    const result = await query('DELETE FROM task_templates WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Template não encontrado.' });
    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao remover template de atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks', authenticate, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          t.id::text AS id,
          t.title,
          COALESCE(t.description, '') AS description,
          TO_CHAR(t.due_date, 'YYYY-MM-DD') AS "dueDate",
          t.priority,
          t.status,
          t.task_type AS "taskType",
          COALESCE(sla.sla_days, 0) AS "slaDays",
          COALESCE(t.goal_target, '') AS "goalTarget",
          t.team_id::text AS "teamId",
          te.name AS "teamName",
          t.created_by::text AS "createdBy",
          creator.full_name AS "createdByName",
          t.completed_at AS "completedAt",
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt",
          ((t.status = 'atrasada') OR (t.due_date < CURRENT_DATE AND t.status <> 'concluida')) AS overdue,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', u.id::text,
                'fullName', u.full_name
              )
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'::json
          ) AS assignees
        FROM tasks t
        LEFT JOIN users creator ON creator.id = t.created_by
        LEFT JOIN teams te ON te.id = t.team_id
        LEFT JOIN task_sla_profiles sla ON sla.type = t.task_type
        LEFT JOIN task_assignees ta ON ta.task_id = t.id
        LEFT JOIN users u ON u.id = ta.user_id
        ${
          isSecretaryRole(req.user)
            ? ''
            : `WHERE EXISTS (
                 SELECT 1 FROM task_assignees ta2
                 WHERE ta2.task_id = t.id AND ta2.user_id = $1
               ) OR EXISTS (
                 SELECT 1 FROM team_members tm2
                 WHERE tm2.team_id = t.team_id AND tm2.user_id = $1
               )`
        }
        GROUP BY
          t.id, t.title, t.description, t.due_date, t.priority, t.status, t.task_type, sla.sla_days, t.goal_target, t.team_id, te.name, t.created_by, creator.full_name, t.completed_at, t.created_at, t.updated_at
        ORDER BY t.due_date ASC, t.created_at DESC
      `,
      isSecretaryRole(req.user) ? [] : [req.user.id]
    );

    const rows = result.rows.map((row) => ({
      ...row,
      slaStatus: computeSlaStatus({
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        status: row.status,
        slaDays: Number(row.slaDays || 0),
      }),
    }));
    return res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar tarefas:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks', authenticate, requirePermission('tasks:create'), async (req, res) => {
  const title = sanitize(req.body?.title || '');
  const description = sanitize(req.body?.description || '');
  const dueDate = sanitize(req.body?.dueDate || '');
  const priority = normalizeTaskPriority(req.body?.priority || 'media');
  const taskType = sanitize(req.body?.taskType || 'administrativo').toLowerCase();
  const goalTarget = sanitize(req.body?.goalTarget || '');
  const teamId = sanitize(req.body?.teamId || '') || null;
  const assigneeIds = Array.isArray(req.body?.assigneeIds)
    ? Array.from(new Set(req.body.assigneeIds.map((value) => sanitize(value)).filter(Boolean)))
    : [];

  if (title.length < 3) return res.status(400).json({ error: 'Título da atividade inválido.' });
  if (!isValidIsoDate(dueDate)) return res.status(400).json({ error: 'Prazo inválido. Use YYYY-MM-DD.' });
  if (!teamId && assigneeIds.length === 0) {
    return res.status(400).json({ error: 'Defina ao menos um usuário ou equipe para receber a atividade.' });
  }

  try {
    const taskTypeExists = await query(
      'SELECT type FROM task_sla_profiles WHERE type = $1 AND is_active = TRUE LIMIT 1',
      [taskType]
    );
    if (taskTypeExists.rowCount === 0) return res.status(400).json({ error: 'Tipo de atividade inválido para SLA.' });

    if (teamId) {
      const teamExists = await query('SELECT id FROM teams WHERE id = $1 LIMIT 1', [teamId]);
      if (teamExists.rowCount === 0) return res.status(404).json({ error: 'Equipe não encontrada.' });
    }

    const taskId = randomUUID();
    await query(
      `
        INSERT INTO tasks (id, title, description, due_date, priority, status, task_type, goal_target, team_id, created_by)
        VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7, $8, $9)
      `,
      [taskId, title, description || null, dueDate, priority, taskType, goalTarget || null, teamId, req.user.id]
    );

    const targetUsers = new Set(assigneeIds);
    if (teamId) {
      const members = await query('SELECT user_id::text AS id FROM team_members WHERE team_id = $1', [teamId]);
      members.rows.forEach((row) => targetUsers.add(row.id));
    }

    for (const userId of targetUsers) {
      await query(
        `
          INSERT INTO task_assignees (task_id, user_id, assigned_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (task_id, user_id) DO NOTHING
        `,
        [taskId, userId, req.user.id]
      );
    }

    const dueDatePtBr = new Date(`${dueDate}T00:00:00`).toLocaleDateString('pt-BR');
    await createNotificationsForUsers(Array.from(targetUsers), {
      title: `Nova atividade: ${title}`,
      message: `Prazo: ${dueDatePtBr}. Acesse o painel de atividades para acompanhar.`,
      kind: 'task',
      relatedEntity: 'task',
      relatedId: taskId,
    });

    await appendTaskEvent({
      taskId,
      userId: req.user.id,
      eventType: 'created',
      message: `${req.user.fullName} criou a atividade.`,
      metadata: { dueDate, priority, taskType, recipients: targetUsers.size },
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'CREATE_TASK',
      entity: 'task',
      entityId: taskId,
      details: { recipients: targetUsers.size, teamId, taskType },
    });

    return res.status(201).json({ id: taskId });
  } catch (error) {
    console.error('Erro ao criar atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/tasks/:id/status', authenticate, async (req, res) => {
  const status = normalizeTaskStatus(req.body?.status || '');
  if (!status) return res.status(400).json({ error: 'Status inválido.' });

  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para atualizar esta atividade.' });

    const result = await query(
      `
        UPDATE tasks
        SET
          status = $2,
          completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id::text AS id, status, completed_at AS "completedAt"
      `,
      [req.params.id, status]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Atividade não encontrada.' });

    const taskDetails = await query('SELECT title, created_by::text AS "createdBy" FROM tasks WHERE id = $1 LIMIT 1', [req.params.id]);
    if (taskDetails.rowCount > 0 && taskDetails.rows[0].createdBy && taskDetails.rows[0].createdBy !== req.user.id) {
      await createNotificationsForUsers([taskDetails.rows[0].createdBy], {
        title: `Atualização de atividade: ${taskDetails.rows[0].title}`,
        message: `${req.user.fullName} alterou o status para ${status.replace('_', ' ')}.`,
        kind: 'task',
        relatedEntity: 'task',
        relatedId: req.params.id,
      });
    }

    await appendTaskEvent({
      taskId: req.params.id,
      userId: req.user.id,
      eventType: 'status_changed',
      message: `${req.user.fullName} atualizou o status para ${status.replace('_', ' ')}.`,
      metadata: { status },
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_TASK_STATUS',
      entity: 'task',
      entityId: req.params.id,
      details: { status },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar status da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/tasks/:id/due-date', authenticate, async (req, res) => {
  const dueDate = sanitize(req.body?.dueDate || '');
  if (!isValidIsoDate(dueDate)) return res.status(400).json({ error: 'Prazo inválido. Use YYYY-MM-DD.' });

  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para ajustar o prazo desta atividade.' });

    const result = await query(
      `
        UPDATE tasks
        SET due_date = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id::text AS id, TO_CHAR(due_date, 'YYYY-MM-DD') AS "dueDate"
      `,
      [req.params.id, dueDate]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Atividade não encontrada.' });

    await appendTaskEvent({
      taskId: req.params.id,
      userId: req.user.id,
      eventType: 'due_date_changed',
      message: `${req.user.fullName} ajustou o prazo da atividade.`,
      metadata: { dueDate },
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'UPDATE_TASK_DUE_DATE',
      entity: 'task',
      entityId: req.params.id,
      details: { dueDate },
    });

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao ajustar prazo da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks/:id/comments', authenticate, async (req, res) => {
  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para visualizar comentários desta atividade.' });

    const result = await query(
      `
        SELECT
          c.id::text AS id,
          c.task_id::text AS "taskId",
          c.user_id::text AS "userId",
          COALESCE(u.full_name, 'Usuário removido') AS "userName",
          c.message,
          c.edited_at AS "editedAt",
          c.created_at AS "createdAt"
        FROM task_comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.task_id = $1
        ORDER BY c.created_at ASC
      `,
      [req.params.id]
    );
    return res.json(result.rows.map((row) => ({ ...row, message: decryptCommentMessage(row.message) })));
  } catch (error) {
    console.error('Erro ao buscar comentários da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks/:id/comments', authenticate, async (req, res) => {
  const message = sanitize(req.body?.message || '');
  if (message.length < 2) return res.status(400).json({ error: 'Comentário inválido.' });

  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para comentar nesta atividade.' });

    const taskResult = await query('SELECT title FROM tasks WHERE id = $1 LIMIT 1', [req.params.id]);
    if (taskResult.rowCount === 0) return res.status(404).json({ error: 'Atividade não encontrada.' });

    const commentId = randomUUID();
    await query(
      `
        INSERT INTO task_comments (id, task_id, user_id, message)
        VALUES ($1, $2, $3, $4)
      `,
      [commentId, req.params.id, req.user.id, encryptCommentMessage(message)]
    );

    const recipients = await query(
      `
        SELECT DISTINCT ta.user_id::text AS id
        FROM task_assignees ta
        WHERE ta.task_id = $1
      `,
      [req.params.id]
    );

    await createNotificationsForUsers(
      recipients.rows.map((row) => row.id).filter((id) => id !== req.user.id),
      {
        title: `Novo comentário em: ${taskResult.rows[0].title}`,
        message: `${req.user.fullName}: ${message.slice(0, 110)}`,
        kind: 'task',
        relatedEntity: 'task',
        relatedId: req.params.id,
      }
    );

    const taskRealtimeRecipients = new Set(await getTaskRealtimeRecipients(req.params.id));
    const mentionedIds = await resolveMentionedUserIds(message);
    const validMentionRecipients = mentionedIds.filter((id) => taskRealtimeRecipients.has(id) && id !== req.user.id);
    if (validMentionRecipients.length > 0) {
      await createNotificationsForUsers(validMentionRecipients, {
        title: `Você foi mencionado em: ${taskResult.rows[0].title}`,
        message: `${req.user.fullName}: ${message.slice(0, 110)}`,
        kind: 'task',
        relatedEntity: 'task',
        relatedId: req.params.id,
      });
    }

    await appendTaskEvent({
      taskId: req.params.id,
      userId: req.user.id,
      eventType: 'commented',
      message: `${req.user.fullName} comentou na atividade.`,
    });

    Array.from(taskRealtimeRecipients).forEach((userId) =>
      pushRealtimeEvent(userId, {
        type: 'task:comment',
        payload: {
          action: 'created',
          taskId: req.params.id,
          commentId,
          byUserId: req.user.id,
        },
      })
    );

    await auditLog({
      req,
      userId: req.user.id,
      action: 'COMMENT_TASK',
      entity: 'task',
      entityId: req.params.id,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Erro ao comentar na atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.patch('/api/tasks/:taskId/comments/:commentId', authenticate, async (req, res) => {
  const message = sanitize(req.body?.message || '');
  if (message.length < 2) return res.status(400).json({ error: 'Comentário inválido.' });

  try {
    const taskAccess = await canAccessTask(req.params.taskId, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para editar comentário desta atividade.' });

    const existing = await query(
      'SELECT user_id::text AS "userId" FROM task_comments WHERE id = $1 AND task_id = $2 LIMIT 1',
      [req.params.commentId, req.params.taskId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Comentário não encontrado.' });

    const isOwner = existing.rows[0].userId === req.user.id;
    if (!isOwner) return res.status(403).json({ error: 'Somente o autor pode editar esta mensagem.' });

    await query(
      `
        UPDATE task_comments
        SET message = $3, edited_at = NOW()
        WHERE id = $1 AND task_id = $2
      `,
      [req.params.commentId, req.params.taskId, encryptCommentMessage(message)]
    );

    await appendTaskEvent({
      taskId: req.params.taskId,
      userId: req.user.id,
      eventType: 'comment_edited',
      message: `${req.user.fullName} editou uma mensagem do chat.`,
      metadata: { commentId: req.params.commentId },
    });

    const realtimeRecipients = await getTaskRealtimeRecipients(req.params.taskId);
    realtimeRecipients.forEach((userId) =>
      pushRealtimeEvent(userId, {
        type: 'task:comment',
        payload: {
          action: 'updated',
          taskId: req.params.taskId,
          commentId: req.params.commentId,
          byUserId: req.user.id,
        },
      })
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao editar comentário da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/tasks/:taskId/comments/:commentId', authenticate, async (req, res) => {
  try {
    const taskAccess = await canAccessTask(req.params.taskId, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para excluir comentário desta atividade.' });

    const existing = await query(
      'SELECT user_id::text AS "userId" FROM task_comments WHERE id = $1 AND task_id = $2 LIMIT 1',
      [req.params.commentId, req.params.taskId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Comentário não encontrado.' });

    const isOwner = existing.rows[0].userId === req.user.id;
    if (!isOwner) return res.status(403).json({ error: 'Somente o autor pode apagar esta mensagem.' });

    await query('DELETE FROM task_comments WHERE id = $1 AND task_id = $2', [req.params.commentId, req.params.taskId]);

    await appendTaskEvent({
      taskId: req.params.taskId,
      userId: req.user.id,
      eventType: 'comment_deleted',
      message: `${req.user.fullName} apagou uma mensagem do chat.`,
      metadata: { commentId: req.params.commentId },
    });

    const realtimeRecipients = await getTaskRealtimeRecipients(req.params.taskId);
    realtimeRecipients.forEach((userId) =>
      pushRealtimeEvent(userId, {
        type: 'task:comment',
        payload: {
          action: 'deleted',
          taskId: req.params.taskId,
          commentId: req.params.commentId,
          byUserId: req.user.id,
        },
      })
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir comentário da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks/:id/presence/ping', authenticate, async (req, res) => {
  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para presença nesta atividade.' });

    const taskId = req.params.id;
    const now = Date.now();
    const current = taskPresenceState.get(taskId) || new Map();
    current.set(req.user.id, { userId: req.user.id, userName: req.user.fullName, updatedAt: now });
    taskPresenceState.set(taskId, current);

    const online = getTaskOnlineUsers(taskId);
    const recipients = await getTaskRealtimeRecipients(taskId);
    recipients.forEach((userId) =>
      pushRealtimeEvent(userId, {
        type: 'task:presence',
        payload: {
          taskId,
          online,
        },
      })
    );

    return res.json({ online });
  } catch (error) {
    console.error('Erro ao registrar presença da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks/:id/typing', authenticate, async (req, res) => {
  const typing = Boolean(req.body?.typing);
  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para digitação nesta atividade.' });

    const taskId = req.params.id;
    const now = Date.now();
    const current = taskTypingState.get(taskId) || new Map();
    if (typing) {
      current.set(req.user.id, { userId: req.user.id, userName: req.user.fullName, updatedAt: now });
    } else {
      current.delete(req.user.id);
    }
    taskTypingState.set(taskId, current);
    cleanupTaskRealtimeMaps();

    const recipients = await getTaskRealtimeRecipients(taskId);
    recipients.forEach((userId) =>
      pushRealtimeEvent(userId, {
        type: 'task:typing',
        payload: {
          taskId,
          userId: req.user.id,
          userName: req.user.fullName,
          typing,
        },
      })
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao atualizar digitação da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks/:id/attachments', authenticate, async (req, res) => {
  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para visualizar anexos desta atividade.' });

    const result = await query(
      `
        SELECT
          a.id::text AS id,
          a.task_id::text AS "taskId",
          a.user_id::text AS "userId",
          COALESCE(u.full_name, 'Usuário removido') AS "userName",
          a.title,
          a.url,
          CASE WHEN a.url LIKE 'local:%' OR a.url LIKE '/uploads/task-attachments/%' THEN 'arquivo' ELSE 'link' END AS "sourceType",
          a.created_at AS "createdAt"
        FROM task_attachments a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.task_id = $1
        ORDER BY a.created_at DESC
      `,
      [req.params.id]
    );
    const attachments = result.rows.map((row) => ({
      ...row,
      url: isStoredLocalAttachment(row.url) ? getAttachmentAccessUrl(row.id) : row.url,
    }));
    return res.json(attachments);
  } catch (error) {
    console.error('Erro ao buscar anexos da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks/attachments/:attachmentId/download', authenticate, async (req, res) => {
  try {
    const attachment = await query(
      `
        SELECT
          id::text AS id,
          task_id::text AS "taskId",
          title,
          url
        FROM task_attachments
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.attachmentId]
    );
    if (attachment.rowCount === 0) return res.status(404).json({ error: 'Anexo não encontrado.' });

    const row = attachment.rows[0];
    const taskAccess = await canAccessTask(row.taskId, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para baixar este anexo.' });
    if (!isStoredLocalAttachment(row.url)) {
      return res.status(400).json({ error: 'Este anexo é um link externo e não suporta download direto pela API.' });
    }

    const fileName = getStoredAttachmentFileName(row.url);
    if (!fileName) return res.status(404).json({ error: 'Arquivo do anexo não localizado.' });
    const filePath = path.join(uploadsDir, fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo do anexo não localizado no servidor.' });

    return res.download(filePath, path.basename(fileName));
  } catch (error) {
    console.error('Erro ao baixar anexo da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks/:id/attachments/upload', authenticate, (req, res, next) => {
  uploadMiddleware.single('file')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo excede 12MB.' });
      if (error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Tipo de arquivo não permitido.' });
      return res.status(400).json({ error: 'Falha no upload do arquivo.' });
    }
    return next();
  });
}, async (req, res) => {
  const title = sanitize(req.body?.title || '') || sanitize(req.file?.originalname || 'Anexo');
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado.' });
  if (title.length < 2) return res.status(400).json({ error: 'Título do anexo inválido.' });

  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para anexar nesta atividade.' });

    const taskResult = await query('SELECT title FROM tasks WHERE id = $1 LIMIT 1', [req.params.id]);
    if (taskResult.rowCount === 0) return res.status(404).json({ error: 'Atividade não encontrada.' });

    const attachmentId = randomUUID();
    const storedUrl = `local:${req.file.filename}`;
    await query(
      `
        INSERT INTO task_attachments (id, task_id, user_id, title, url)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [attachmentId, req.params.id, req.user.id, title, storedUrl]
    );

    const recipients = await query('SELECT DISTINCT user_id::text AS id FROM task_assignees WHERE task_id = $1', [req.params.id]);
    await createNotificationsForUsers(
      recipients.rows.map((row) => row.id).filter((id) => id !== req.user.id),
      {
        title: `Novo arquivo em: ${taskResult.rows[0].title}`,
        message: `${req.user.fullName} anexou "${title}".`,
        kind: 'task',
        relatedEntity: 'task',
        relatedId: req.params.id,
      }
    );

    await appendTaskEvent({
      taskId: req.params.id,
      userId: req.user.id,
      eventType: 'attachment_uploaded',
      message: `${req.user.fullName} enviou o arquivo "${title}".`,
      metadata: { title, url: getAttachmentAccessUrl(attachmentId) },
    });

    return res.status(201).json({ id: attachmentId, url: getAttachmentAccessUrl(attachmentId) });
  } catch (error) {
    console.error('Erro ao enviar arquivo da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/tasks/:id/attachments', authenticate, async (req, res) => {
  const title = sanitize(req.body?.title || '');
  const url = sanitize(req.body?.url || '');
  if (title.length < 2) return res.status(400).json({ error: 'Título do anexo inválido.' });
  if (!isValidHttpUrl(url)) return res.status(400).json({ error: 'URL do anexo inválida. Use http(s).' });

  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para anexar nesta atividade.' });

    const taskResult = await query('SELECT title FROM tasks WHERE id = $1 LIMIT 1', [req.params.id]);
    if (taskResult.rowCount === 0) return res.status(404).json({ error: 'Atividade não encontrada.' });

    const attachmentId = randomUUID();
    await query(
      `
        INSERT INTO task_attachments (id, task_id, user_id, title, url)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [attachmentId, req.params.id, req.user.id, title, url]
    );

    const recipients = await query('SELECT DISTINCT user_id::text AS id FROM task_assignees WHERE task_id = $1', [req.params.id]);
    await createNotificationsForUsers(
      recipients.rows.map((row) => row.id).filter((id) => id !== req.user.id),
      {
        title: `Novo anexo em: ${taskResult.rows[0].title}`,
        message: `${req.user.fullName} anexou "${title}".`,
        kind: 'task',
        relatedEntity: 'task',
        relatedId: req.params.id,
      }
    );

    await appendTaskEvent({
      taskId: req.params.id,
      userId: req.user.id,
      eventType: 'attachment_added',
      message: `${req.user.fullName} anexou "${title}".`,
      metadata: { title, url },
    });

    await auditLog({
      req,
      userId: req.user.id,
      action: 'ATTACH_TASK_DOCUMENT',
      entity: 'task',
      entityId: req.params.id,
      details: { title },
    });

    return res.status(201).json({ id: attachmentId });
  } catch (error) {
    console.error('Erro ao anexar documento na atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks/:id/timeline', authenticate, async (req, res) => {
  try {
    const taskAccess = await canAccessTask(req.params.id, req.user);
    if (!taskAccess) return res.status(403).json({ error: 'Sem permissão para visualizar timeline desta atividade.' });

    const result = await query(
      `
        SELECT
          e.id::text AS id,
          e.task_id::text AS "taskId",
          e.user_id::text AS "userId",
          COALESCE(u.full_name, 'Usuário removido') AS "userName",
          e.event_type AS "eventType",
          e.message,
          e.metadata,
          e.created_at AS "createdAt"
        FROM task_events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.task_id = $1
        ORDER BY e.created_at DESC
      `,
      [req.params.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar timeline da atividade:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/tasks-metrics/secretary', authenticate, requireSecretaryAccess, async (_req, res) => {
  try {
    const summaryResult = await query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes,
          COUNT(*) FILTER (WHERE status = 'em_andamento')::int AS emAndamento,
          COUNT(*) FILTER (WHERE status = 'concluida')::int AS concluidas,
          COUNT(*) FILTER (WHERE status = 'atrasada' OR (status <> 'concluida' AND due_date < CURRENT_DATE))::int AS atrasadas
        FROM tasks
      `
    );

    const byUserResult = await query(
      `
        SELECT
          u.id::text AS id,
          u.full_name AS "fullName",
          COUNT(ta.task_id)::int AS total,
          COUNT(ta.task_id) FILTER (WHERE t.status = 'concluida')::int AS concluidas,
          COUNT(ta.task_id) FILTER (WHERE t.status = 'atrasada' OR (t.status <> 'concluida' AND t.due_date < CURRENT_DATE))::int AS atrasadas
        FROM users u
        LEFT JOIN task_assignees ta ON ta.user_id = u.id
        LEFT JOIN tasks t ON t.id = ta.task_id
        WHERE u.is_active = TRUE
        GROUP BY u.id, u.full_name
        ORDER BY atrasadas DESC, total DESC, u.full_name ASC
      `
    );

    const byTeamMonthResult = await query(
      `
        SELECT
          COALESCE(t.team_id::text, 'sem-equipe') AS "teamId",
          COALESCE(te.name, 'Sem equipe') AS "teamName",
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE t.status = 'concluida')::int AS concluidas
        FROM tasks t
        LEFT JOIN teams te ON te.id = t.team_id
        WHERE DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', NOW())
        GROUP BY COALESCE(t.team_id::text, 'sem-equipe'), COALESCE(te.name, 'Sem equipe')
        ORDER BY total DESC, "teamName" ASC
      `
    );

    const rankingResult = await query(
      `
        SELECT
          u.id::text AS id,
          u.full_name AS "fullName",
          COUNT(ta.task_id)::int AS total,
          COUNT(ta.task_id) FILTER (WHERE t.status = 'concluida')::int AS concluidas,
          COUNT(ta.task_id) FILTER (WHERE t.status = 'concluida' AND COALESCE(sla.sla_days, 0) > 0 AND t.completed_at <= (t.created_at + (sla.sla_days::text || ' days')::interval))::int AS "noPrazo"
        FROM users u
        LEFT JOIN task_assignees ta ON ta.user_id = u.id
        LEFT JOIN tasks t ON t.id = ta.task_id
        LEFT JOIN task_sla_profiles sla ON sla.type = t.task_type
        WHERE u.is_active = TRUE
        GROUP BY u.id, u.full_name
      `
    );

    const ranking = rankingResult.rows.map((row) => {
      const total = Number(row.total || 0);
      const concluidas = Number(row.concluidas || 0);
      const noPrazo = Number(row.noPrazo || 0);
      const entrega = total > 0 ? concluidas / total : 0;
      const qualidade = concluidas > 0 ? noPrazo / concluidas : 0;
      const score = Math.round(((entrega * 0.6) + (qualidade * 0.4)) * 100);
      return { ...row, score };
    }).sort((a, b) => b.score - a.score || b.concluidas - a.concluidas);

    const totalAtivas = Number(summaryResult.rows[0].pendentes || 0) + Number(summaryResult.rows[0].emAndamento || 0);
    const concluidasMesResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM tasks
        WHERE completed_at IS NOT NULL
          AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW())
      `
    );
    const noPrazoMesResult = await query(
      `
        SELECT COUNT(*)::int AS total
        FROM tasks t
        LEFT JOIN task_sla_profiles sla ON sla.type = t.task_type
        WHERE t.completed_at IS NOT NULL
          AND COALESCE(sla.sla_days, 0) > 0
          AND DATE_TRUNC('month', t.completed_at) = DATE_TRUNC('month', NOW())
          AND t.completed_at <= (t.created_at + (sla.sla_days::text || ' days')::interval)
      `
    );
    const concluidasMes = Number(concluidasMesResult.rows[0]?.total || 0);
    const noPrazoMes = Number(noPrazoMesResult.rows[0]?.total || 0);
    const taxaNoPrazo = concluidasMes > 0 ? Math.round((noPrazoMes / concluidasMes) * 100) : 0;

    return res.json({
      summary: summaryResult.rows[0],
      byUser: byUserResult.rows,
      byTeamMonth: byTeamMonthResult.rows.map((item) => ({
        ...item,
        progresso: Number(item.total || 0) > 0 ? Math.round((Number(item.concluidas || 0) / Number(item.total || 0)) * 100) : 0,
      })),
      ranking,
      executivo: {
        totalAtivas,
        totalConcluidasMes: concluidasMes,
        taxaNoPrazo,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar métricas do secretário:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/atendimentos', authenticate, async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        atendimentos.id::text AS id,
        TO_CHAR(atendimentos.data, 'YYYY-MM-DD') AS data,
        atendimentos.turno AS turno,
        atendimentos.departamento AS departamento,
        atendimentos.atividade AS atividade,
        atendimentos.responsavel AS responsavel,
        atendimentos.local AS local,
        atendimentos.created_by::text AS "createdBy",
        creator.full_name AS "createdByName",
        atendimentos.updated_at AS "updatedAt",
        atendimentos.updated_by::text AS "updatedBy",
        updater.full_name AS "updatedByName",
        atendimentos.created_at AS "createdAt"
      FROM atendimentos
      LEFT JOIN users creator ON creator.id = atendimentos.created_by
      LEFT JOIN users updater ON updater.id = atendimentos.updated_by
      ORDER BY atendimentos.created_at DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar atendimentos:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.get('/api/atendimentos/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          atendimentos.id::text AS id,
          TO_CHAR(atendimentos.data, 'YYYY-MM-DD') AS data,
          atendimentos.turno AS turno,
          atendimentos.departamento AS departamento,
          atendimentos.atividade AS atividade,
          atendimentos.responsavel AS responsavel,
          atendimentos.local AS local,
          atendimentos.created_by::text AS "createdBy",
          creator.full_name AS "createdByName",
          atendimentos.updated_at AS "updatedAt",
          atendimentos.updated_by::text AS "updatedBy",
          updater.full_name AS "updatedByName",
          atendimentos.created_at AS "createdAt"
        FROM atendimentos
        LEFT JOIN users creator ON creator.id = atendimentos.created_by
        LEFT JOIN users updater ON updater.id = atendimentos.updated_by
        WHERE atendimentos.id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Atendimento não encontrado.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar atendimento:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.post('/api/atendimentos', authenticate, requirePermission('atendimentos:create'), async (req, res) => {
  const payload = buildAtendimentoPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });

  const newRow = { id: randomUUID(), ...payload, createdAt: new Date().toISOString() };

  try {
    const result = await query(
      `
        INSERT INTO atendimentos (id, data, turno, departamento, atividade, responsavel, local, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id::text AS id, TO_CHAR(data, 'YYYY-MM-DD') AS data, turno, departamento, atividade, responsavel, local, created_by::text AS "createdBy", NULL::text AS "createdByName", NULL::timestamptz AS "updatedAt", NULL::text AS "updatedBy", NULL::text AS "updatedByName", created_at AS "createdAt"
      `,
      [newRow.id, newRow.data, newRow.turno, newRow.departamento, newRow.atividade, newRow.responsavel, newRow.local, req.user.id, newRow.createdAt]
    );

    await auditLog({ req, userId: req.user.id, action: 'CREATE_ATENDIMENTO', entity: 'atendimento', entityId: newRow.id });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar atendimento:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.put('/api/atendimentos/:id', authenticate, async (req, res) => {
  const payload = buildAtendimentoPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });

  try {
    const result = await query(
      `
        UPDATE atendimentos
        SET data = $2, turno = $3, departamento = $4, atividade = $5, responsavel = $6, local = $7, updated_at = NOW(), updated_by = $8
        WHERE id = $1
        RETURNING id::text AS id, TO_CHAR(data, 'YYYY-MM-DD') AS data, turno, departamento, atividade, responsavel, local, created_by::text AS "createdBy", NULL::text AS "createdByName", updated_at AS "updatedAt", updated_by::text AS "updatedBy", NULL::text AS "updatedByName", created_at AS "createdAt"
      `,
      [req.params.id, payload.data, payload.turno, payload.departamento, payload.atividade, payload.responsavel, payload.local, req.user.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Atendimento não encontrado.' });

    await auditLog({ req, userId: req.user.id, action: 'UPDATE_ATENDIMENTO', entity: 'atendimento', entityId: req.params.id });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar atendimento:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.delete('/api/atendimentos/:id', authenticate, requirePermission('atendimentos:delete'), async (req, res) => {
  try {
    const result = await query('DELETE FROM atendimentos WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Atendimento não encontrado.' });

    await auditLog({ req, userId: req.user.id, action: 'DELETE_ATENDIMENTO', entity: 'atendimento', entityId: req.params.id });
    return res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir atendimento:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  }

  return res.status(404).type('html').send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 | Prefeitura de Toritama</title>
  </head>
  <body style="font-family:Segoe UI, sans-serif;background:#e9f5ee;padding:32px;display:grid;place-items:center;min-height:100vh;">
    <div style="background:#fff;border:1px solid #d8efdf;border-radius:24px;padding:32px;max-width:680px;width:100%;box-shadow:0 20px 60px rgba(15,81,50,.16)">
      <img src="/logo-prefeitura.PNG" alt="Prefeitura de Toritama" style="width:200px;max-width:100%;height:auto" />
      <h1 style="color:#0f5132">Página não encontrada</h1>
      <p style="color:#2f5f49">A rota acessada não existe neste servidor.</p>
      <a href="/" style="display:inline-block;margin-top:16px;background:#1e8449;color:#fff;text-decoration:none;padding:10px 14px;border-radius:12px">Voltar ao início</a>
    </div>
  </body>
</html>`);
});

app.use((error, _req, res, _next) => {
  opsMetrics.lastErrors.unshift({
    type: 'unhandled',
    message: String(error?.message || 'Erro não identificado'),
    at: new Date().toISOString(),
  });
  opsMetrics.lastErrors = opsMetrics.lastErrors.slice(0, 60);
  if (error.message === 'Acesso negado por política de CORS') {
    return res.status(403).json({ error: 'Origem não permitida.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload muito grande.' });
  }
  console.error('Erro não tratado na API:', error);
  return res.status(500).json({ error: 'Erro interno no servidor.' });
});

async function ensureSecretaryAccount() {
  const existing = await query(
    `
      SELECT id::text AS id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [SECRETARY_EMAIL]
  );

  const passwordHash = await bcrypt.hash(SECRETARY_PASSWORD, 12);

  if (existing.rowCount > 0) {
    await query(
      `
        UPDATE users
        SET
          full_name = $2,
          name = $2,
          role = 'admin',
          department = $3,
          is_active = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          approved_at = COALESCE(approved_at, NOW()),
          terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
          privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
          terms_version = COALESCE(terms_version, $5),
          privacy_version = COALESCE(privacy_version, $6),
          password_hash = $4
        WHERE id = $1::uuid
      `,
      [existing.rows[0].id, SECRETARY_FULL_NAME, SECRETARY_DEPARTMENT, passwordHash, TERMS_VERSION, PRIVACY_VERSION]
    );
    return;
  }

  await query(
    `
      INSERT INTO users (
        id, name, full_name, email, password_hash, role, department, phone, is_active, email_verified_at, approved_at, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version
      )
      VALUES ($1, $2, $2, $3, $4, 'admin', $5, NULL, TRUE, NOW(), NOW(), NOW(), NOW(), $6, $7)
    `,
    [randomUUID(), SECRETARY_FULL_NAME, SECRETARY_EMAIL, passwordHash, SECRETARY_DEPARTMENT, TERMS_VERSION, PRIVACY_VERSION]
  );
}

async function ensureRootAdminAccount() {
  await query(
    `
      UPDATE users
      SET role = 'admin'
      WHERE role = 'superadmin' AND email <> $1
    `,
    [ROOT_ADMIN_ACCOUNT.email]
  );

  const existing = await query(
    `
      SELECT id::text AS id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [ROOT_ADMIN_ACCOUNT.email]
  );

  const passwordHash = await bcrypt.hash(ROOT_ADMIN_ACCOUNT.password, 12);

  if (existing.rowCount > 0) {
    await query(
      `
        UPDATE users
        SET
          full_name = $2,
          name = $2,
          role = 'superadmin',
          department = $3,
          is_active = TRUE,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          approved_at = COALESCE(approved_at, NOW()),
          terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
          privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
          terms_version = COALESCE(terms_version, $5),
          privacy_version = COALESCE(privacy_version, $6),
          password_hash = $4
        WHERE id = $1::uuid
      `,
      [existing.rows[0].id, ROOT_ADMIN_ACCOUNT.fullName, ROOT_ADMIN_ACCOUNT.department, passwordHash, TERMS_VERSION, PRIVACY_VERSION]
    );
    return;
  }

  await query(
    `
      INSERT INTO users (
        id, name, full_name, email, password_hash, role, department, phone, is_active, email_verified_at, approved_at, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version
      )
      VALUES ($1, $2, $2, $3, $4, 'superadmin', $5, NULL, TRUE, NOW(), NOW(), NOW(), NOW(), $6, $7)
    `,
    [randomUUID(), ROOT_ADMIN_ACCOUNT.fullName, ROOT_ADMIN_ACCOUNT.email, passwordHash, ROOT_ADMIN_ACCOUNT.department, TERMS_VERSION, PRIVACY_VERSION]
  );
}

async function start() {
  try {
    if (isProduction && SECRETARY_PASSWORD === 'Secretario@2026!') {
      throw new Error('Defina SECRETARY_PASSWORD com valor seguro em produção.');
    }
    if (isProduction && ROOT_ADMIN_ACCOUNT.password === 'Admin@2026!') {
      throw new Error('Defina ROOT_ADMIN_PASSWORD com valor seguro em produção.');
    }
    await initDatabase();
    await ensureRootAdminAccount();
    await ensureSecretaryAccount();
    await maintainCommentCryptoKeyring();
    if (COMMENT_KMS_ENABLED) {
      commentCryptoMaintenanceTimer = setInterval(() => {
        maintainCommentCryptoKeyring().catch((error) => {
          console.error('Falha na manutenção automática de chaves de comentário:', error);
        });
      }, COMMENT_CRYPTO_MAINTENANCE_MS);
    }
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`);
      console.log(`Conta ADMIN ativa em ${maskEmail(ROOT_ADMIN_ACCOUNT.email)}. Altere ROOT_ADMIN_PASSWORD em produção.`);
      console.log(`Conta SECRETÁRIO ativa em ${SECRETARY_EMAIL}. Altere SECRETARY_PASSWORD em produção.`);
      if (!emailTransporter) {
        console.log('SMTP não configurado. Em dev, código de verificação será exibido no log.');
      }
      if (COMMENT_KMS_ENABLED) {
        console.log('Criptografia de chat com KMS lógico habilitada (rotação/expurgo automáticos).');
      }
    });
  } catch (error) {
    console.error('Falha ao inicializar API:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  if (commentCryptoMaintenanceTimer) clearInterval(commentCryptoMaintenanceTimer);
});

process.on('SIGINT', () => {
  if (commentCryptoMaintenanceTimer) clearInterval(commentCryptoMaintenanceTimer);
});

start();
