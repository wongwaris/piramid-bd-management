import { EmailTemplateService } from '../../lib/email/EmailTemplateService.js';
import { readJsonBody, requireAdmin, sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  const service = new EmailTemplateService();
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { templates: await service.list() });
      return;
    }

    const body = await readJsonBody(req);

    if (req.method === 'POST') {
      requireAdmin(req);
      if (body.preview) {
        const template = body.template || await service.get(body.id || body.template_key);
        sendJson(res, 200, { preview: service.preview(template, body.variables || {}) });
        return;
      }
      sendJson(res, 200, { template: await service.upsert(body, body.updated_by || 'admin') });
      return;
    }

    if (req.method === 'DELETE') {
      requireAdmin(req);
      sendJson(res, 200, { deleted: await service.delete(body.id) });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, error.message.includes('Admin') ? 403 : 500, { error: error.message });
  }
}
