import { neon } from '@neondatabase/serverless';

const STATE_ID = 'piramid-bd-management';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// Neutralize any HTML/script markup in a free-text value. Fields in this app are
// plain text only, so stripping tag-like constructs, inline event handlers and
// dangerous URI schemes prevents stored XSS without harming legitimate data.
function sanitizeString(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')                              // HTML comments
    .replace(/<\/?[a-zA-Z!][^>]*>/g, '')                          // complete tags <img ...>, </b>
    .replace(/<\/?[a-zA-Z!][^>]*$/g, '')                          // dangling/truncated tag at end of string
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')      // inline event handlers (onerror=, onload=, ...)
    .replace(/(?:javascript|vbscript|data)\s*:/gi, '');           // dangerous URI schemes
}

// Recursively sanitize every string in an object/array, preserving structure.
function sanitizeDeep(value) {
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = sanitizeDeep(value[key]);
    return out;
  }
  return value;
}

export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    send(res, 500, { error: 'DATABASE_URL is not configured' });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        select data, updated_at
        from bd_app_state
        where id = ${STATE_ID}
        limit 1
      `;
      const row = rows[0];
      // Sanitize on the way out too, so even a legacy/poisoned row can never
      // deliver executable markup to a browser.
      send(res, 200, row ? { data: sanitizeDeep(row.data), updated_at: row.updated_at } : { data: null, updated_at: null });
      return;
    }

    if (req.method === 'POST') {
      const writeKey = process.env.STATE_WRITE_KEY;
      if (writeKey && req.headers['x-bd-write-key'] !== writeKey) {
        send(res, 401, { error: 'Unauthorized: invalid write key' });
        return;
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

      if (!body || typeof body.data !== 'object' || Array.isArray(body.data)) {
        send(res, 400, { error: 'Expected JSON body with object field: data' });
        return;
      }

      // Strip any HTML/script markup from incoming data before persisting,
      // so a malicious input field can never store an executable payload.
      const cleanData = sanitizeDeep(body.data);

      const rows = await sql`
        insert into bd_app_state (id, data, updated_at)
        values (${STATE_ID}, ${JSON.stringify(cleanData)}::jsonb, now())
        on conflict (id)
        do update set data = excluded.data, updated_at = now()
        returning updated_at
      `;
      send(res, 200, { ok: true, updated_at: rows[0]?.updated_at || null });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    send(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('state api failed', error);
    send(res, 500, { error: 'Database operation failed' });
  }
}
