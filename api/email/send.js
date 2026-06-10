import { EmailQueueWorker } from '../../lib/email/EmailQueueWorker.js';
import { readJsonBody, sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const body = await readJsonBody(req);
    const worker = new EmailQueueWorker();
    const item = await worker.enqueue({
      to: body.to,
      cc: body.cc || [],
      bcc: body.bcc || [],
      reply_to: body.reply_to,
      subject: body.subject || '[PIRAMID BD] Test email',
      html_body: body.html_body || '<h2>PIRAMID BD test email</h2><p>Email module is ready.</p>',
      text_body: body.text_body || 'PIRAMID BD test email\nEmail module is ready.',
      related_module: body.related_module || 'email_settings',
      related_record_id: body.related_record_id || 'test',
      triggered_by_user: body.triggered_by_user || 'admin',
    });
    const processed = body.send_now === false ? [] : await worker.processOne(item);
    if (processed && ['failed', 'retry'].includes(processed.status)) {
      sendJson(res, 502, {
        error: processed.error_message || 'Email provider rejected the message',
        queued: item,
        processed,
      });
      return;
    }
    sendJson(res, 200, { queued: item, processed });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
