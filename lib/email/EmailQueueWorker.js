import { getSql, json } from './db.js';
import { EmailService } from './EmailService.js';
import { EmailLogRepository } from './EmailLogRepository.js';

export class EmailQueueWorker {
  constructor(sql = getSql(), emailService = new EmailService(), logRepo = new EmailLogRepository(sql)) {
    this.sql = sql;
    this.emailService = emailService;
    this.logRepo = logRepo;
  }

  async enqueue(input) {
    const rows = await this.sql`
      insert into email_queue (
        template_id, template_key, to_emails, cc_emails, bcc_emails, reply_to,
        subject, html_body, text_body, attachments, template_variables, status,
        scheduled_at, retry_count, max_retry, related_module, related_record_id, triggered_by_user
      )
      values (
        ${input.template_id || null}::uuid, ${input.template_key || null},
        ${json(input.to || [])}::jsonb, ${json(input.cc || [])}::jsonb, ${json(input.bcc || [])}::jsonb,
        ${input.reply_to || null}, ${input.subject}, ${input.html_body}, ${input.text_body},
        ${json(input.attachments || [])}::jsonb, ${json(input.template_variables || {})}::jsonb,
        ${input.status || 'pending'}, ${input.scheduled_at || new Date().toISOString()},
        ${Number(input.retry_count || 0)}, ${Number(input.max_retry ?? 3)},
        ${input.related_module || null}, ${input.related_record_id || null}, ${input.triggered_by_user || null}
      )
      returning *
    `;
    return rows[0];
  }

  async list(limit = 100) {
    return this.sql`select * from email_queue order by scheduled_at desc limit ${limit}`;
  }

  async updateStatus(id, status, fields = {}) {
    const rows = await this.sql`
      update email_queue set
        status = ${status},
        error_message = ${fields.error_message || null},
        provider_response = ${json(fields.provider_response || null)}::jsonb,
        retry_count = coalesce(${fields.retry_count ?? null}, retry_count),
        updated_at = now()
      where id = ${id}::uuid
      returning *
    `;
    return rows[0];
  }

  async cancel(id) {
    return this.updateStatus(id, 'cancelled');
  }

  async retry(id) {
    const rows = await this.sql`
      update email_queue set status = 'retry', scheduled_at = now(), updated_at = now()
      where id = ${id}::uuid and status in ('failed','retry')
      returning *
    `;
    return rows[0];
  }

  async processDue(limit = 10) {
    const rows = await this.sql`
      select * from email_queue
      where status in ('pending','retry') and scheduled_at <= now()
      order by scheduled_at asc
      limit ${limit}
    `;

    const results = [];
    for (const row of rows) {
      results.push(await this.processOne(row));
    }
    return results;
  }

  async processOne(row) {
    await this.updateStatus(row.id, 'sending');
    try {
      const response = await this.emailService.send({
        to: row.to_emails,
        cc: row.cc_emails,
        bcc: row.bcc_emails,
        reply_to: row.reply_to,
        subject: row.subject,
        html_body: row.html_body,
        text_body: row.text_body,
        attachments: row.attachments,
      });
      const sent = await this.updateStatus(row.id, 'sent', { provider_response: response });
      for (const recipient of row.to_emails || []) {
        await this.logRepo.create({ ...row, queue_id: row.id, recipient, status: 'sent', sent_at: new Date().toISOString(), provider_response: response });
      }
      return sent;
    } catch (error) {
      const retryCount = Number(row.retry_count || 0) + 1;
      const status = retryCount < Number(row.max_retry || 3) ? 'retry' : 'failed';
      const failed = await this.updateStatus(row.id, status, { error_message: error.message, retry_count: retryCount });
      for (const recipient of row.to_emails || []) {
        await this.logRepo.create({ ...row, queue_id: row.id, recipient, status, error_message: error.message });
      }
      return failed;
    }
  }
}
