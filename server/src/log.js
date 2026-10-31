import { query } from './db.js';

// Writes an audit row. Never throws: a logging failure must not break the request.
export async function logAction(userId, action, detail = '') {
  try {
    await query('INSERT INTO system_logs (user_id, action, detail) VALUES ($1, $2, $3)', [
      userId ?? null,
      String(action).slice(0, 100),
      String(detail).slice(0, 500),
    ]);
  } catch (err) {
    console.error('logAction failed:', err.message);
  }
}
