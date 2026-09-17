import { checkPassword, makeSession, sessionCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'POST saja' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { email, password } = body || {};

  if (!checkPassword(email, password)) {
    /* slow down guessing */
    await new Promise(r => setTimeout(r, 900));
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  res.setHeader('set-cookie', sessionCookie(makeSession(String(email).trim().toLowerCase())));
  return res.status(200).json({ ok: true });
}
