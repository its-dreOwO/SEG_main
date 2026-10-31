import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

export const COOKIE_NAME = 'sid';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
// Outside production a random per-process secret is used if none is set (sessions reset on restart).
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

export const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd, // Secure needs https; tests and local dev run over http
  sameSite: 'lax',
  path: '/',
});

export function signSession(userId) {
  return jwt.sign({ sub: String(userId) }, SECRET, { algorithm: 'HS256', expiresIn: SESSION_MS / 1000 });
}

export function setSessionCookie(res, userId) {
  res.cookie(COOKIE_NAME, signSession(userId), { ...cookieOptions(), maxAge: SESSION_MS });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

// Express 4 does not catch rejected promises; this forwards them to the error handler.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export async function loadUser(id) {
  const { rows } = await query(
    `SELECT u.id, u.active, r.name AS role,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id, r.name`,
    [id],
  );
  return rows[0] || null;
}

// Reloads the user and permissions on every request, so deactivation and permission edits apply at once.
export const requireAuth = wrap(async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  let userId;
  try {
    userId = Number(jwt.verify(token, SECRET, { algorithms: ['HS256'] }).sub);
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = Number.isInteger(userId) ? await loadUser(userId) : null;
  if (!user || !user.active) return res.status(401).json({ error: 'Authentication required' });
  req.user = { id: user.id, role: user.role, permissions: user.permissions };
  next();
});

export const requirePermission = (code) => (req, res, next) => {
  if (!req.user?.permissions.includes(code)) return res.status(403).json({ error: 'Forbidden' });
  next();
};
