// One-time migration endpoint — runs email/notification table DDL against the
// production Neon DB.  All statements use CREATE TABLE/INDEX IF NOT EXISTS and
// INSERT … ON CONFLICT DO NOTHING, so repeated calls are safe (idempotent).
// Protected by the same STATE_WRITE_KEY header used by /api/state.
import { neon } from '@neondatabase/serverless';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  // Gate with write key (same as /api/state)
  const writeKey = process.env.STATE_WRITE_KEY || '';
  if (writeKey) {
    const provided = req.headers['x-bd-write-key'] || '';
    if (provided !== writeKey) return send(res, 403, { error: 'Forbidden' });
  }

  const db = neon(process.env.DATABASE_URL);
  const results = [];

  const steps = [
    {
      name: 'pgcrypto',
      sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    },
    {
      name: 'email_templates',
      sql: `CREATE TABLE IF NOT EXISTS email_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_key text NOT NULL UNIQUE,
        name text NOT NULL,
        description text,
        subject_template text NOT NULL,
        html_body_template text NOT NULL,
        text_body_template text NOT NULL,
        variables jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_by text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'email_queue',
      sql: `CREATE TABLE IF NOT EXISTS email_queue (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
        template_key text,
        to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
        cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
        bcc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
        reply_to text,
        subject text NOT NULL,
        html_body text NOT NULL,
        text_body text NOT NULL,
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','sending','sent','failed','retry','cancelled')),
        scheduled_at timestamptz NOT NULL DEFAULT now(),
        retry_count integer NOT NULL DEFAULT 0,
        max_retry integer NOT NULL DEFAULT 3,
        error_message text,
        provider_response jsonb,
        related_module text,
        related_record_id text,
        triggered_by_user text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'email_logs',
      sql: `CREATE TABLE IF NOT EXISTS email_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        queue_id uuid REFERENCES email_queue(id) ON DELETE SET NULL,
        recipient text NOT NULL,
        subject text NOT NULL,
        template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
        template_key text,
        status text NOT NULL,
        sent_at timestamptz,
        error_message text,
        provider_response jsonb,
        related_module text,
        related_record_id text,
        triggered_by_user text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'notification_preferences',
      sql: `CREATE TABLE IF NOT EXISTS notification_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        email text NOT NULL,
        task_assigned boolean NOT NULL DEFAULT true,
        task_due_reminder boolean NOT NULL DEFAULT true,
        overdue_alert boolean NOT NULL DEFAULT true,
        comment_mention boolean NOT NULL DEFAULT true,
        daily_summary boolean NOT NULL DEFAULT true,
        weekly_summary boolean NOT NULL DEFAULT true,
        monthly_summary boolean NOT NULL DEFAULT true,
        project_risk_alert boolean NOT NULL DEFAULT true,
        quiet_hours_start time,
        quiet_hours_end time,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id)
      )`,
    },
    {
      name: 'email_configuration_logs',
      sql: `CREATE TABLE IF NOT EXISTS email_configuration_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        changed_by text,
        change_type text NOT NULL,
        changes jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'email_settings',
      sql: `CREATE TABLE IF NOT EXISTS email_settings (
        id text PRIMARY KEY DEFAULT 'default',
        provider text NOT NULL DEFAULT 'smtp',
        smtp_host text NOT NULL DEFAULT '',
        smtp_port integer NOT NULL DEFAULT 587,
        smtp_secure boolean NOT NULL DEFAULT false,
        smtp_user text NOT NULL DEFAULT '',
        smtp_from text NOT NULL DEFAULT '',
        smtp_password_encrypted text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: 'idx_email_queue_status',
      sql: `CREATE INDEX IF NOT EXISTS email_queue_status_scheduled_idx
            ON email_queue(status, scheduled_at)`,
    },
    {
      name: 'idx_email_logs_created',
      sql: `CREATE INDEX IF NOT EXISTS email_logs_created_at_idx
            ON email_logs(created_at DESC)`,
    },
    {
      name: 'idx_notif_prefs_user',
      sql: `CREATE INDEX IF NOT EXISTS notification_preferences_user_idx
            ON notification_preferences(user_id)`,
    },
    {
      name: 'seed_templates',
      sql: `INSERT INTO email_templates
              (template_key,name,description,subject_template,html_body_template,text_body_template,variables)
            VALUES
              ('task_assigned','Task Assigned','New task assignment email',
               '[PIRAMID BD] New task assigned: {{task_name}}',
               '<h2>New task assigned</h2><p>Hello {{user_name}},</p><p><b>{{task_name}}</b> for project <b>{{project_name}}</b> is due on {{due_date}}.</p><p>Status: {{status}}</p><p><a href="{{platform_link}}">Open PIRAMID BD</a></p>',
               'Hello {{user_name}},\n\nNew task assigned: {{task_name}}\nProject: {{project_name}}\nDue: {{due_date}}\nStatus: {{status}}\n\nOpen: {{platform_link}}',
               '["user_name","task_name","project_name","due_date","status","platform_link"]'::jsonb),
              ('daily_summary','Daily Task Summary','Daily BD task summary',
               '[PIRAMID BD] Daily summary - {{user_name}}',
               '<h2>Daily BD Summary</h2><p>Hello {{user_name}},</p><p>{{summary}}</p><p><a href="{{platform_link}}">Open dashboard</a></p>',
               'Daily BD Summary\n\nHello {{user_name}},\n\n{{summary}}\n\n{{platform_link}}',
               '["user_name","summary","platform_link"]'::jsonb),
              ('weekly_summary','Weekly Task Summary','Weekly BD task summary',
               '[PIRAMID BD] Weekly summary - {{week_label}}',
               '<h2>Weekly BD Summary</h2><p>{{summary}}</p><p><a href="{{platform_link}}">Open dashboard</a></p>',
               'Weekly BD Summary {{week_label}}\n\n{{summary}}\n\n{{platform_link}}',
               '["week_label","summary","platform_link"]'::jsonb)
            ON CONFLICT (template_key) DO NOTHING`,
    },
  ];

  for (const step of steps) {
    try {
      await db(step.sql);
      results.push({ step: step.name, status: 'ok' });
    } catch (err) {
      results.push({ step: step.name, status: 'error', message: err.message });
    }
  }

  const failed = results.filter(r => r.status === 'error');
  return send(res, failed.length ? 207 : 200, {
    ok: failed.length === 0,
    results,
    summary: `${results.length - failed.length}/${results.length} steps succeeded`,
  });
}
