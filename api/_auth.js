import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { select, upsert } from './_supabase.js';

/* One owner, no user table. The password is never stored, only its scrypt hash
   in LOGIN_PASSWORD_HASH (format: scrypt$salt$hash). Sessions are signed cookies,
   and the login_guard table in Supabase adds what a stateless cookie cannot:
   lockout after repeated failures, and logging out every device at once. */

export const COOKIE = '__Host-kurator_session';
const WEEK = 7 * 24 * 3600;

/* lockout rules */
const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 5;        /* failures from one address inside the window */
const GLOBAL_LIMIT = 20;   /* failures from everywhere, against spread-out guessing */
const LOCK_MS = 15 * 60 * 1000;

const b64url = s => Buffer.from(s).toString('base64url');
const secret = () => String(process.env.SESSION_SECRET || '').trim();
const sign = data => createHmac('sha256', secret()).update(data).digest('base64url');

/* changes whenever the password changes, so a new password ends every old session */
const passwordVersion = () => sign('pv:' + String(process.env.LOGIN_PASSWORD_HASH || '').trim()).slice(0, 16);

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(email, password) {
  const wantEmail = String(process.env.LOGIN_EMAIL || '').trim().toLowerCase();
  const [kind, salt, hash] = String(process.env.LOGIN_PASSWORD_HASH || '').trim().split('$');
  if (!wantEmail || kind !== 'scrypt' || !salt || !hash || secret().length < 32) return false;

  /* cap input size so a huge password cannot tie up the function */
  const got = scryptSync(String(password || '').slice(0, 200), salt, 64).toString('hex');
  const emailOk = same(String(email || '').trim().toLowerCase().slice(0, 200), wantEmail);
  return same(got, hash) && emailOk;
}

export function makeSession(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ email, iat: now, exp: now + WEEK, pv: passwordVersion() }));
  return payload + '.' + sign(payload);
}

function decode(req) {
  if (secret().length < 32) return null;
  const raw = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, mac] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !mac || !same(sign(payload), mac)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!(data.exp > Date.now() / 1000) || data.pv !== passwordVersion()) return null;
    return data;
  } catch {
    return null;
  }
}

/* valid signature, not expired, and issued after the last "log out everywhere" */
export async function readSession(req) {
  const data = decode(req);
  if (!data) return null;
  const rows = await select('login_guard?key=eq.sessions&select=window_start');
  const validAfter = rows[0] ? new Date(rows[0].window_start).getTime() : 0;
  return data.iat * 1000 >= validAfter ? data : null;
}

export async function endAllSessions() {
  /* one second of slack so a cookie issued this same second is also ended */
  await upsert('login_guard', { key: 'sessions', failures: 0, window_start: new Date(Date.now() + 1000).toISOString(), locked_until: null });
}

export function clientIp(req) {
  return String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64);
}

async function guardRow(key) {
  const rows = await select('login_guard?key=eq.' + encodeURIComponent(key) + '&select=failures,window_start,locked_until');
  return rows[0] || null;
}

/* returns the lock end time if this address, or everyone, is locked out */
export async function lockedUntil(ip) {
  const now = Date.now();
  for (const key of ['ip:' + ip, 'global']) {
    const row = await guardRow(key);
    if (row && row.locked_until && new Date(row.locked_until).getTime() > now) return new Date(row.locked_until);
  }
  return null;
}

export async function recordFailure(ip) {
  const now = Date.now();
  for (const [key, limit] of [['ip:' + ip, IP_LIMIT], ['global', GLOBAL_LIMIT]]) {
    const row = await guardRow(key);
    const fresh = row && now - new Date(row.window_start).getTime() < WINDOW_MS;
    const failures = (fresh ? row.failures : 0) + 1;
    await upsert('login_guard', {
      key,
      failures,
      window_start: fresh ? row.window_start : new Date(now).toISOString(),
      locked_until: failures >= limit ? new Date(now + LOCK_MS).toISOString() : (fresh ? row.locked_until : null)
    });
  }
}

export async function clearFailures(ip) {
  await upsert('login_guard', { key: 'ip:' + ip, failures: 0, window_start: new Date().toISOString(), locked_until: null });
}

/* browsers send Origin on POST; reject posts coming from another site */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export const sessionCookie = value =>
  COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + WEEK;

export const clearCookie = () => COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
