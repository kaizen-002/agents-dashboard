import { readSession } from './_auth.js';

/* The laptop pushes a snapshot every 10 seconds. Older than this means it stopped. */
const STALE_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!readSession(req)) return res.status(401).json({ error: 'login dulu' });

  const url = String(process.env.SUPABASE_URL || '').replace(/[/]+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'SUPABASE_URL atau SUPABASE_SERVICE_KEY belum diisi di Vercel.' });

  const got = await fetch(url + '/rest/v1/dashboard_state?id=eq.1&select=state,updated_at', {
    headers: key.startsWith('eyJ') ? { apikey: key, authorization: 'Bearer ' + key } : { apikey: key }
  });
  if (!got.ok) return res.status(502).json({ error: 'Supabase ' + got.status });

  const rows = await got.json();
  const row = rows[0];
  if (!row) {
    return res.status(200).json({ remote: true, syncedAt: null, bot: false, agents: [], topics: null, files: [], renders: [] });
  }

  const fresh = Date.now() - new Date(row.updated_at).getTime() < STALE_MS;
  return res.status(200).json({ ...row.state, bot: !!row.state.bot && fresh, remote: true, syncedAt: row.updated_at, fresh });
}
