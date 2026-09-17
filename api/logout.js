import { clearCookie, readSession, endAllSessions, sameOrigin } from './_auth.js';

/* POST only, so another site cannot log you out with a hidden link.
   { everywhere: true } also ends sessions on every other device. */
export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'POST saja' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Ditolak.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  if (body && body.everywhere) {
    const session = await readSession(req).catch(() => null);
    if (!session) return res.status(401).json({ error: 'login dulu' });
    await endAllSessions();
  }

  res.setHeader('set-cookie', clearCookie());
  return res.status(200).json({ ok: true });
}
