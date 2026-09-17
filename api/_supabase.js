/* Tiny Supabase REST client for the Vercel functions. Service key only, never sent to the browser. */

const clean = v => String(v || '').trim().replace(/^['"]|['"]$/g, '');

export function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/[/]+$/, '');
  const key = clean(process.env.SUPABASE_SERVICE_KEY);
  return url && key ? { url, key } : null;
}

const headers = key => key.startsWith('eyJ')
  ? { apikey: key, authorization: 'Bearer ' + key }
  : { apikey: key };

export async function select(path) {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_KEY belum diisi di Vercel.');
  const res = await fetch(cfg.url + '/rest/v1/' + path, { headers: headers(cfg.key) });
  if (!res.ok) {
    const e = new Error('Supabase ' + res.status);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export async function upsert(table, row) {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('Supabase belum diatur.');
  const res = await fetch(cfg.url + '/rest/v1/' + table + '?on_conflict=key', {
    method: 'POST',
    headers: { ...headers(cfg.key), 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row])
  });
  if (!res.ok) throw new Error('Supabase ' + res.status + ' ' + (await res.text()).slice(0, 120));
}
