import { readSession } from './_auth.js';
import { supabaseConfig } from './_supabase.js';

/* AgentScope, Arya's Android app. Same login cookie as the dashboard.
   GET /api/app?file=<name>   one JSON bundle from the private bucket (a video's script, shots, credits and check,
                              or "scout" / "watcher"), passed through as it is.
   GET /api/app?video=<slug>  a one-hour signed link to that video's 720p preview; the phone streams it from
                              Supabase directly, so the video never goes through this function. */
const BUCKET = 'agentscope';
const NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;

const headers = key => key.startsWith('eyJ') ? { apikey: key, authorization: 'Bearer ' + key } : { apikey: key };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('allow', 'GET'); return res.status(405).json({ error: 'GET saja' }); }
  const cfg = supabaseConfig();
  if (!cfg) return res.status(500).json({ error: 'Supabase belum diatur di Vercel.' });

  let session;
  try { session = await readSession(req); } catch (err) { return res.status(502).json({ error: err.message }); }
  if (!session) return res.status(401).json({ error: 'login dulu' });

  const file = String(req.query.file || ''), video = String(req.query.video || '');
  const storage = cfg.url + '/storage/v1';

  if (file) {
    if (!NAME.test(file)) return res.status(400).json({ error: 'nama file nggak valid' });
    const r = await fetch(storage + '/object/authenticated/' + BUCKET + '/outputs/' + file + '.json', { headers: headers(cfg.key) });
    if (r.status === 404 || r.status === 400) return res.status(404).json({ error: 'belum ada' });
    if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).send(await r.text());
  }

  if (video) {
    if (!NAME.test(video)) return res.status(400).json({ error: 'nama video nggak valid' });
    const r = await fetch(storage + '/object/sign/' + BUCKET + '/previews/' + video + '.mp4', {
      method: 'POST', headers: { ...headers(cfg.key), 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
    });
    if (r.status === 404 || r.status === 400) return res.status(404).json({ error: 'preview belum ada' });
    if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
    const { signedURL } = await r.json();
    return res.status(200).json({ url: storage + signedURL, expiresIn: 3600 });
  }

  return res.status(400).json({ error: 'pakai ?file= atau ?video=' });
}
