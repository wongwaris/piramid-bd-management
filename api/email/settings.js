import { getSql, json } from '../../lib/email/db.js';
import { readJsonBody, requireAdmin, sendJson } from '../../lib/email/utils.js';

function publicSettings() {
  return {
    provider: process.env.EMAIL_PROVIDER || 'smtp',
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: process.env.SMTP_PORT || '587',
    smtp_secure: process.env.SMTP_SECURE === 'true',
    smtp_user: process.env.SMTP_USER || '',
    smtp_from: process.env.EMAIL_FROM || process.env.SMTP_FROM || '',
    smtp_password_configured: Boolean(process.env.SMTP_PASSWORD),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, publicSettings());
      return;
    }
    if (req.method === 'POST') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      const safeChanges = {
        provider: body.provider,
        smtp_host: body.smtp_host,
        smtp_port: body.smtp_port,
        smtp_secure: body.smtp_secure,
        smtp_user: body.smtp_user,
        smtp_from: body.smtp_from,
        smtp_password_changed: Boolean(body.smtp_password),
      };
      await getSql()`
        insert into email_configuration_logs (changed_by, change_type, changes)
        values (${body.changed_by || 'admin'}, 'email_settings_update', ${json(safeChanges)}::jsonb)
      `;
      sendJson(res, 200, {
        ok: true,
        message: 'Settings change logged. Configure SMTP secrets in Vercel Environment Variables.',
        settings: publicSettings(),
      });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, error.message.includes('Admin') ? 403 : 500, { error: error.message });
  }
}
