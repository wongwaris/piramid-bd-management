import { getSql, json } from './db.js';

export class EmailLogRepository {
  constructor(sql = getSql()) {
    this.sql = sql;
  }

  async list(limit = 100) {
    return this.sql`select * from email_logs order by created_at desc limit ${limit}`;
  }

  async create(input) {
    const rows = await this.sql`
      insert into email_logs (
        queue_id, recipient, subject, template_id, template_key, status, sent_at,
        error_message, provider_response, related_module, related_record_id, triggered_by_user
      )
      values (
        ${input.queue_id || null}::uuid, ${input.recipient}, ${input.subject},
        ${input.template_id || null}::uuid, ${input.template_key || null}, ${input.status},
        ${input.sent_at || null}, ${input.error_message || null},
        ${json(input.provider_response || null)}::jsonb, ${input.related_module || null},
        ${input.related_record_id || null}, ${input.triggered_by_user || null}
      )
      returning *
    `;
    return rows[0];
  }
}
