import { EmailLogRepository } from '../../lib/email/EmailLogRepository.js';
import { sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const repo = new EmailLogRepository();
    sendJson(res, 200, { logs: await repo.list(Number(req.query.limit || 100)) });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
