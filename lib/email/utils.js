const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const HEADER_RE = /[\r\n]/;

export function normalizeEmails(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[;,]/);
  return list.map(v => String(v).trim()).filter(Boolean);
}

export function validateEmailAddress(email) {
  const clean = String(email || '').trim();
  return EMAIL_RE.test(clean) && !HEADER_RE.test(clean);
}

export function assertSafeEmailList(value, field = 'email') {
  const emails = normalizeEmails(value);
  const invalid = emails.filter(email => !validateEmailAddress(email));
  if (invalid.length) {
    throw new Error(`Invalid ${field}: ${invalid.join(', ')}`);
  }
  return emails;
}

export function assertSafeHeader(value, field) {
  if (value && HEADER_RE.test(String(value))) {
    throw new Error(`Invalid ${field}: header injection is not allowed`);
  }
  return value;
}

export function renderTemplate(template, variables = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((obj, part) => obj?.[part], variables);
    return value === undefined || value === null ? '' : String(value);
  });
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function requireAdmin(req) {
  const role = req.headers['x-user-role'] || req.headers['x-admin-role'];
  if (role && String(role).toLowerCase() !== 'admin') {
    throw new Error('Admin access required');
  }
}
