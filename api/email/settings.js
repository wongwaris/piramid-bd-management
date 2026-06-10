import { getSql, json } from '../../lib/email/db.js';
import { EmailSettingsService } from '../../lib/email/EmailSettingsService.js';
import { readJsonBody, requireAdmin, sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  const service = new EmailSettingsService();
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await service.publicSettings());
      return;
    }
    if (req.method === 'POST') {
      requireAdmin(req);
      const body = await readJsonBody(req);
      await service.update(body, body.changed_by || 'admin');
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
        message: 'Email settings saved.',
        settings: await service.publicSettings(),
      });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, error.message.includes('Admin') ? 403 : 500, { error: error.message });
  }
}
