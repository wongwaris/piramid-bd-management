create extension if not exists pgcrypto;

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  description text,
  subject_template text not null,
  html_body_template text not null,
  text_body_template text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_queue (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete set null,
  template_key text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  bcc_emails jsonb not null default '[]'::jsonb,
  reply_to text,
  subject text not null,
  html_body text not null,
  text_body text not null,
  attachments jsonb not null default '[]'::jsonb,
  template_variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','retry','cancelled')),
  scheduled_at timestamptz not null default now(),
  retry_count integer not null default 0,
  max_retry integer not null default 3,
  error_message text,
  provider_response jsonb,
  related_module text,
  related_record_id text,
  triggered_by_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references email_queue(id) on delete set null,
  recipient text not null,
  subject text not null,
  template_id uuid references email_templates(id) on delete set null,
  template_key text,
  status text not null,
  sent_at timestamptz,
  error_message text,
  provider_response jsonb,
  related_module text,
  related_record_id text,
  triggered_by_user text,
  created_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  email text not null,
  task_assigned boolean not null default true,
  task_due_reminder boolean not null default true,
  overdue_alert boolean not null default true,
  comment_mention boolean not null default true,
  daily_summary boolean not null default true,
  weekly_summary boolean not null default true,
  monthly_summary boolean not null default true,
  project_risk_alert boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists email_configuration_logs (
  id uuid primary key default gen_random_uuid(),
  changed_by text,
  change_type text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_queue_status_scheduled_idx on email_queue(status, scheduled_at);
create index if not exists email_logs_created_at_idx on email_logs(created_at desc);
create index if not exists notification_preferences_user_idx on notification_preferences(user_id);

insert into email_templates (template_key, name, description, subject_template, html_body_template, text_body_template, variables)
values
('task_assigned','Task Assigned','New task assignment email','[PIRAMID BD] New task assigned: {{task_name}}','<h2>New task assigned</h2><p>Hello {{user_name}},</p><p><b>{{task_name}}</b> for project <b>{{project_name}}</b> is due on {{due_date}}.</p><p>Status: {{status}}</p><p><a href="{{platform_link}}">Open PIRAMID BD</a></p>','Hello {{user_name}},\n\nNew task assigned: {{task_name}}\nProject: {{project_name}}\nDue: {{due_date}}\nStatus: {{status}}\n\nOpen: {{platform_link}}','["user_name","task_name","project_name","due_date","status","platform_link"]'::jsonb),
('daily_summary','Daily Task Summary','Daily BD task summary','[PIRAMID BD] Daily summary - {{user_name}}','<h2>Daily BD Summary</h2><p>Hello {{user_name}},</p><p>{{summary}}</p><p><a href="{{platform_link}}">Open dashboard</a></p>','Daily BD Summary\n\nHello {{user_name}},\n\n{{summary}}\n\n{{platform_link}}','["user_name","summary","platform_link"]'::jsonb),
('weekly_summary','Weekly Task Summary','Weekly BD task summary','[PIRAMID BD] Weekly summary - {{week_label}}','<h2>Weekly BD Summary</h2><p>{{summary}}</p><p><a href="{{platform_link}}">Open dashboard</a></p>','Weekly BD Summary {{week_label}}\n\n{{summary}}\n\n{{platform_link}}','["week_label","summary","platform_link"]'::jsonb)
on conflict (template_key) do nothing;
