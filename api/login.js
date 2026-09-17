import {
  checkPassword, makeSession, sessionCookie, clientIp,
  lockedUntil, recordFailure, clearFailures, sameOrigin
} from './_auth.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'POST saja' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Ditolak.' });

  const ip = clientIp(req);

  /* no guard table means no brute-force protection: refuse rather than run unprotected */
  let until;
  try {
    until = await lockedUntil(ip);
  } catch (err) {
    return res.status(503).json({ error: 'Pengaman login belum siap (' + err.message + '). Jalankan web/supabase.sql di Supabase.' });
  }
  if (until) {
    const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
    return res.status(429).json({ error: 'Terlalu banyak percobaan gagal. Coba lagi dalam ' + mins + ' menit.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { email, password } = body || {};

  if (!checkPassword(email, password)) {
    await recordFailure(ip).catch(() => {});
    await sleep(700 + Math.floor(Math.random() * 600));
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  await clearFailures(ip).catch(() => {});
  res.setHeader('set-cookie', sessionCookie(makeSession(String(email).trim().toLowerCase())));
  return res.status(200).json({ ok: true });
}
