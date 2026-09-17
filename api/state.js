import { readSession } from './_auth.js';
import { select, supabaseConfig } from './_supabase.js';

/* The laptop pushes a snapshot every 10 seconds. Older than this means it stopped. */
const STALE_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!supabaseConfig()) return res.status(500).json({ error: 'SUPABASE_URL atau SUPABASE_SERVICE_KEY belum diisi di Vercel.' });

  let session, rows;
  try {
    session = await readSession(req);
    if (!session) return res.status(401).json({ error: 'login dulu' });
    rows = await select('dashboard_state?id=eq.1&select=state,updated_at');
  } catch (err) {
    const hint = err.status === 401
      ? ' - kunci ditolak. Cek SUPABASE_SERVICE_KEY di Vercel (sb_secret_...), lalu Redeploy.'
      : err.status === 404 ? ' - tabel belum ada. Jalankan web/supabase.sql di Supabase.' : '';
    return res.status(502).json({ error: err.message + hint });
  }

  const row = rows[0];
  if (!row) {
    return res.status(200).json({ remote: true, syncedAt: null, bot: false, agents: [], topics: null, files: [], renders: [] });
  }

  const fresh = Date.now() - new Date(row.updated_at).getTime() < STALE_MS;
  return res.status(200).json({ ...row.state, bot: !!row.state.bot && fresh, remote: true, syncedAt: row.updated_at, fresh });
}
