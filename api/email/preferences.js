import { NotificationPreferenceService } from '../../lib/email/NotificationPreferenceService.js';
import { readJsonBody, sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  const service = new NotificationPreferenceService();
  try {
    if (req.method === 'GET') {
      if (req.query.user_id) {
        sendJson(res, 200, { preference: await service.get(req.query.user_id) });
        return;
      }
      sendJson(res, 200, { preferences: await service.list() });
      return;
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, { preference: await service.upsert(body) });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
