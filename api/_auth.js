import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/* One owner, no user table. The password is never stored, only its scrypt hash
   in LOGIN_PASSWORD_HASH (format: scrypt$salt$hash). Sessions are signed cookies. */

export const COOKIE = 'kurator_session';
const WEEK = 7 * 24 * 3600;

const b64url = s => Buffer.from(s).toString('base64url');
const sign = data => createHmac('sha256', process.env.SESSION_SECRET || '').update(data).digest('base64url');

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(email, password) {
  const wantEmail = String(process.env.LOGIN_EMAIL || '').trim().toLowerCase();
  const stored = String(process.env.LOGIN_PASSWORD_HASH || '');
  const [kind, salt, hash] = stored.split('$');
  if (!wantEmail || kind !== 'scrypt' || !salt || !hash) return false;

  const got = scryptSync(String(password || ''), salt, 64).toString('hex');
  const emailOk = same(String(email || '').trim().toLowerCase(), wantEmail);
  return same(got, hash) && emailOk;
}

export function makeSession(email) {
  const payload = b64url(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + WEEK }));
  return payload + '.' + sign(payload);
}

export function readSession(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, mac] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !mac || !same(sign(payload), mac)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

export const sessionCookie = value =>
  COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + WEEK;

export const clearCookie = () => COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
