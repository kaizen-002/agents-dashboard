import { readSession, sameOrigin } from './_auth.js';
import { supabaseConfig } from './_supabase.js';

/* AgentScope, Arya's Android app. Same login cookie as the dashboard.
   GET /api/app?file=<name>   one JSON bundle from the private bucket (a video's script, shots, credits and check,
                              or "scout" / "watcher"), passed through as it is.
   GET /api/app?video=<slug>  a one-hour signed link to that video's 720p preview; the phone streams it from
                              Supabase directly, so the video never goes through this function. */
const BUCKET = 'agentscope';
const NAME = /^[a-z0-9][a-z0-9._-]{0,120}$/;

const headers = key => key.startsWith('eyJ') ? { apikey: key, authorization: 'Bearer ' + key } : { apikey: key };

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=[\w-]{11}[^\s]*|live\/[\w-]{11}[^\s]*)|youtu\.be\/[\w-]{11}[^\s]*)$/;
const ENUMS = { format: ['vertical', 'square', 'landscape'], style: ['kuning', 'tegas', 'kotak'], language: ['id', 'en'] };

/* A clip job from the phone, checked field by field, then left in the bucket's inbox/ for Kurator. Only the known
   fields are kept, so nothing else from the request body ever reaches the laptop. */
function jobFrom(body) {
  if (body?.type === 'channel') {
    const channel = String(body.channel || '').trim();
    if (!/^@[\w.-]{2,60}$/.test(channel) && !/^https:\/\/(www\.)?youtube\.com\/[@\w./-]{2,120}$/.test(channel)) return null;
    return { type: 'channel', channel, top: Math.min(20, Math.max(1, Number(body.top) || 10)) };
  }
  if (body?.type !== 'clip') return null;
  const url = String(body.url || '').trim();
  if (!YOUTUBE.test(url) || url.length > 200) return null;
  const job = { type: 'clip', url, clips: Math.min(5, Math.max(1, Number(body.clips) || 3)) };
  for (const [key, allowed] of Object.entries(ENUMS)) {
    const value = String(body[key] || allowed[0]);
    if (!allowed.includes(value)) return null;
    job[key] = value;
  }
  return job;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); return res.status(405).json({ error: 'GET atau POST' }); }
  if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).json({ error: 'Ditolak.' });
  const cfg = supabaseConfig();
  if (!cfg) return res.status(500).json({ error: 'Supabase belum diatur di Vercel.' });

  let session;
  try { session = await readSession(req); } catch (err) { return res.status(502).json({ error: err.message }); }
  if (!session) return res.status(401).json({ error: 'login dulu' });

  const storage = cfg.url + '/storage/v1';

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const job = jobFrom(body);
    if (!job) return res.status(400).json({ error: 'permintaan clip nggak valid' });
    job.at = new Date().toISOString();
    const name = 'inbox/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json';
    const r = await fetch(storage + '/object/' + BUCKET + '/' + name, {
      method: 'POST', headers: { ...headers(cfg.key), 'content-type': 'application/json' }, body: JSON.stringify(job)
    });
    if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
    return res.status(200).json({ ok: true, queued: job.type });
  }

  const file = String(req.query.file || ''), video = String(req.query.video || ''), clip = String(req.query.clip || '');

  /* a finished clip, full quality: a one-hour signed link the phone downloads directly from Supabase */
  if (clip) {
    if (!NAME.test(clip)) return res.status(400).json({ error: 'nama klip nggak valid' });
    const r = await fetch(storage + '/object/sign/' + BUCKET + '/clips/' + clip + '.mp4', {
      method: 'POST', headers: { ...headers(cfg.key), 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
    });
    if (r.status === 404 || r.status === 400) return res.status(404).json({ error: 'klip belum ada' });
    if (!r.ok) return res.status(502).json({ error: 'storage ' + r.status });
    const { signedURL } = await r.json();
    return res.status(200).json({ url: storage + signedURL, expiresIn: 3600 });
  }

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
