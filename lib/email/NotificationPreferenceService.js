import { getSql } from './db.js';

export class NotificationPreferenceService {
  constructor(sql = getSql()) {
    this.sql = sql;
  }

  async list() {
    return this.sql`select * from notification_preferences order by email`;
  }

  async get(userId) {
    const rows = await this.sql`select * from notification_preferences where user_id = ${userId} limit 1`;
    return rows[0] || null;
  }

  async upsert(input) {
    const rows = await this.sql`
      insert into notification_preferences (
        user_id, email, task_assigned, task_due_reminder, overdue_alert,
        comment_mention, daily_summary, weekly_summary, monthly_summary,
        project_risk_alert, quiet_hours_start, quiet_hours_end, updated_at
      )
      values (
        ${input.user_id}, ${input.email}, ${input.task_assigned !== false},
        ${input.task_due_reminder !== false}, ${input.overdue_alert !== false},
        ${input.comment_mention !== false}, ${input.daily_summary !== false},
        ${input.weekly_summary !== false}, ${input.monthly_summary !== false},
        ${input.project_risk_alert !== false}, ${input.quiet_hours_start || null},
        ${input.quiet_hours_end || null}, now()
      )
      on conflict (user_id) do update set
        email = excluded.email,
        task_assigned = excluded.task_assigned,
        task_due_reminder = excluded.task_due_reminder,
        overdue_alert = excluded.overdue_alert,
        comment_mention = excluded.comment_mention,
        daily_summary = excluded.daily_summary,
        weekly_summary = excluded.weekly_summary,
        monthly_summary = excluded.monthly_summary,
        project_risk_alert = excluded.project_risk_alert,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        updated_at = now()
      returning *
    `;
    return rows[0];
  }

  allows(pref, trigger) {
    if (!pref) return true;
    const map = {
      task_assigned: pref.task_assigned,
      task_due_reminder: pref.task_due_reminder,
      overdue_alert: pref.overdue_alert,
      comment_mention: pref.comment_mention,
      daily_summary: pref.daily_summary,
      weekly_summary: pref.weekly_summary,
      monthly_summary: pref.monthly_summary,
      project_risk_alert: pref.project_risk_alert,
    };
    return map[trigger] !== false;
  }
}
