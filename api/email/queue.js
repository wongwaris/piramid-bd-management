import { EmailQueueWorker } from '../../lib/email/EmailQueueWorker.js';
import { EmailTemplateService } from '../../lib/email/EmailTemplateService.js';
import { assertSafeEmailList, readJsonBody, renderTemplate, sendJson } from '../../lib/email/utils.js';

export default async function handler(req, res) {
  const worker = new EmailQueueWorker();
  const templates = new EmailTemplateService();
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { queue: await worker.list(Number(req.query.limit || 100)) });
      return;
    }

    const body = await readJsonBody(req);

    if (req.method === 'POST') {
      const action = body.action || 'enqueue';
      if (action === 'process') {
        sendJson(res, 200, { processed: await worker.processDue(Number(body.limit || 10)) });
        return;
      }
      if (action === 'retry') {
        sendJson(res, 200, { queue: await worker.retry(body.id) });
        return;
      }
      if (action === 'cancel') {
        sendJson(res, 200, { queue: await worker.cancel(body.id) });
        return;
      }

      const template = body.template_key ? await templates.get(body.template_key) : null;
      const variables = body.template_variables || {};
      const queueItem = await worker.enqueue({
        template_id: template?.id,
        template_key: template?.template_key || body.template_key,
        to: assertSafeEmailList(body.to, 'to'),
        cc: assertSafeEmailList(body.cc, 'cc'),
        bcc: assertSafeEmailList(body.bcc, 'bcc'),
        reply_to: body.reply_to,
        subject: template ? renderTemplate(template.subject_template, variables) : body.subject,
        html_body: template ? renderTemplate(template.html_body_template, variables) : body.html_body,
        text_body: template ? renderTemplate(template.text_body_template, variables) : body.text_body,
        attachments: body.attachments || [],
        template_variables: variables,
        scheduled_at: body.scheduled_at,
        max_retry: body.max_retry,
        related_module: body.related_module,
        related_record_id: body.related_record_id,
        triggered_by_user: body.triggered_by_user,
      });
      sendJson(res, 200, { queue: queueItem });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
