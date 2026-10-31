import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { hashPassword, checkPassword } from '../password.js';
import { logAction } from '../log.js';
import { requireAuth, setSessionCookie, clearSessionCookie, wrap } from '../auth.js';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
// Valid bcrypt hash of a random string; compared against when the email is unknown to equalise timing.
const DUMMY_HASH = '$2b$10$eUkE1XhLuqGwJ0guh/sI/OxnUFkE/uWniHRzqNuGZnOyTL8lwdhju';

// Removes HTML tags and any stray angle brackets from user-supplied text.
export function stripHtml(value) {
  let s = String(value);
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^>]*>/g, '');
  } while (s !== prev);
  return s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  display_name: row.display_name,
  avatar: row.avatar,
  bio: row.bio,
  role: row.role,
});

async function fetchProfile(id) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.avatar, u.bio, r.name AS role,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id, r.name`,
    [id],
  );
  return rows[0];
}

export function createAuthRouter({ loginMax = Number(process.env.LOGIN_RATE_MAX) || 10 } = {}) {
  const router = express.Router();

  // Only failed attempts count. Keyed on req.ip, which honours the app's `trust proxy` setting.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginMax,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts, try again later' },
  });

  router.post('/auth/register', wrap(async (req, res) => {
    const { email, password, display_name } = req.body ?? {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 254) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: 'Password must be 8 to 72 characters' });
    }
    const name = typeof display_name === 'string' ? stripHtml(display_name) : '';
    if (!name || name.length > 80) return res.status(400).json({ error: 'Display name is required (max 80 characters)' });

    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role_id)
       SELECT $1, $2, $3, id FROM roles WHERE name = 'customer'
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email.trim().toLowerCase(), hash, name],
    );
    if (!rows.length) return res.status(409).json({ error: 'Email is already registered' });
    const profile = await fetchProfile(rows[0].id);
    setSessionCookie(res, profile.id);
    await logAction(profile.id, 'register', `email=${profile.email}`);
    res.status(201).json({ user: publicUser(profile) });
  }));

  router.post('/auth/login', loginLimiter, wrap(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const normalized = email.trim().toLowerCase();
    const { rows } = await query('SELECT id, password_hash, active FROM users WHERE email = $1', [normalized]);
    const user = rows[0];
    const match = await checkPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !match || !user.active) {
      await logAction(user?.id, 'login_failed', `email=${normalized.slice(0, 100)}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const profile = await fetchProfile(user.id);
    setSessionCookie(res, user.id);
    await logAction(user.id, 'login', `email=${profile.email}`);
    res.json({ user: publicUser(profile) });
  }));

  router.post('/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, wrap(async (req, res) => {
    const profile = await fetchProfile(req.user.id);
    res.json({ ...publicUser(profile), permissions: profile.permissions });
  }));

  router.patch('/me', requireAuth, wrap(async (req, res) => {
    const { display_name, bio, avatar } = req.body ?? {};
    const sets = [];
    const params = [];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (display_name !== undefined) {
      const v = typeof display_name === 'string' ? stripHtml(display_name) : '';
      if (!v || v.length > 80) return res.status(400).json({ error: 'Display name must be 1 to 80 characters' });
      add('display_name', v);
    }
    if (bio !== undefined) {
      if (typeof bio !== 'string') return res.status(400).json({ error: 'Bio must be text' });
      const v = stripHtml(bio);
      if (v.length > 1000) return res.status(400).json({ error: 'Bio must be at most 1000 characters' });
      add('bio', v);
    }
    if (avatar !== undefined) {
      if (avatar === null || avatar === '') add('avatar', null);
      else {
        const v = typeof avatar === 'string' ? stripHtml(avatar) : '';
        if (!v || v.length > 500 || !/^(https?:\/\/|\/)/i.test(v)) {
          return res.status(400).json({ error: 'Avatar must be an http(s) URL or a site path' });
        }
        add('avatar', v);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.user.id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    const profile = await fetchProfile(req.user.id);
    res.json({ ...publicUser(profile), permissions: profile.permissions });
  }));

  return router;
}
