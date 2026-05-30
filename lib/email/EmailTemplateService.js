import { getSql, json } from './db.js';
import { renderTemplate } from './utils.js';

export class EmailTemplateService {
  constructor(sql = getSql()) {
    this.sql = sql;
  }

  async list() {
    return this.sql`select * from email_templates order by name`;
  }

  async get(idOrKey) {
    const rows = await this.sql`
      select * from email_templates
      where id::text = ${idOrKey} or template_key = ${idOrKey}
      limit 1
    `;
    return rows[0] || null;
  }

  async upsert(input, actor = 'system') {
    const id = input.id || null;
    const rows = await this.sql`
      insert into email_templates (
        id, template_key, name, description, subject_template, html_body_template,
        text_body_template, variables, is_active, created_by, updated_by, updated_at
      )
      values (
        coalesce(${id}::uuid, gen_random_uuid()), ${input.template_key}, ${input.name},
        ${input.description || null}, ${input.subject_template}, ${input.html_body_template},
        ${input.text_body_template}, ${json(input.variables || [])}::jsonb,
        ${input.is_active !== false}, ${actor}, ${actor}, now()
      )
      on conflict (template_key) do update set
        name = excluded.name,
        description = excluded.description,
        subject_template = excluded.subject_template,
        html_body_template = excluded.html_body_template,
        text_body_template = excluded.text_body_template,
        variables = excluded.variables,
        is_active = excluded.is_active,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning *
    `;
    return rows[0];
  }

  async delete(id) {
    return this.sql`delete from email_templates where id = ${id}::uuid returning id`;
  }

  preview(template, variables = {}) {
    return {
      subject: renderTemplate(template.subject_template, variables),
      html_body: renderTemplate(template.html_body_template, variables),
      text_body: renderTemplate(template.text_body_template, variables),
    };
  }
}
