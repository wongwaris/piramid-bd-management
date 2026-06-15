import { neon } from '@neondatabase/serverless';
import { EmailQueueWorker } from '../../lib/email/EmailQueueWorker.js';

// --- Bangkok (UTC+7) date helpers ---
function bangkokNow() {
  const now = new Date();
  return new Date(now.getTime() + 7 * 3600 * 1000 - now.getTimezoneOffset() * 60000);
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// --- task helpers ---
function isOverdue(t) {
  if (!t.due || t.status === 'Done') return false;
  const bkk = bangkokNow(); bkk.setHours(0, 0, 0, 0);
  return new Date(t.due + 'T23:59:59+07:00') < bkk;
}
function taskSummary(tasks) {
  return {
    total: tasks.length,
    done: tasks.filter(t => t.status === 'Done').length,
    doing: tasks.filter(t => ['Doing', 'In Progress'].includes(t.status)).length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };
}
function ownerNames(state, t) {
  const ids = [t.owner, ...(t.owners || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  return ids.map(id => (state.teams || []).find(m => m.id === id)?.name || id);
}

// --- HTML email builder ---
function he(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildEmail(rule, tasks, state, windowLabel) {
  const summary = taskSummary(tasks);
  const period = rule.reportPeriod || 'Daily';
  const subject = `[PIRAMID BD] ${period} ${rule.level} Summary - ${windowLabel}`;
  const greeting = rule.level === 'Executive' ? 'เรียนผู้บริหาร,' : `รายงาน BD สรุปงาน ${he(rule.level)}`;

  const byProj = {};
  tasks.slice(0, 15).forEach(t => {
    const pname = (state.projects || []).find(p => p.id === t.project)?.name || (t.project ? `Project ${t.project}` : 'Internal');
    if (!byProj[pname]) byProj[pname] = [];
    byProj[pname].push(t);
  });

  let taskRows = '';
  Object.entries(byProj).forEach(([pname, pts], pi) => {
    taskRows += `<tr><td colspan="3" style="padding:8px 12px 4px;font-weight:700;color:#5b7cfa;font-size:13px;border-bottom:1px solid #e5e7eb">${pi + 1}. ${he(pname)}</td></tr>`;
    pts.forEach((t, si) => {
      const badge = isOverdue(t)
        ? '<span style="color:#dc2626;font-weight:600">&#9888; Overdue</span>'
        : t.status === 'Done'
          ? '<span style="color:#16a34a;font-weight:600">&#10003; Done</span>'
          : `<span style="color:#d97706">&rarr; ${he(t.status)}</span>`;
      const owners = ownerNames(state, t).map(he).join(', ') || '&mdash;';
      taskRows += `<tr style="background:${si % 2 ? '#f9fafb' : '#fff'}"><td style="padding:5px 12px 5px 20px;font-size:12px">${he(t.title || '')}</td><td style="padding:5px 8px;font-size:11px;white-space:nowrap">${badge}</td><td style="padding:5px 8px;font-size:11px;color:#6b7280">${owners} &middot; ${t.due || '&mdash;'}</td></tr>`;
    });
  });
  if (!taskRows) taskRows = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">ไม่มีงานในช่วงเวลานี้</td></tr>';

  const cols = [
    { l: 'Total', n: summary.total, bg: '#eff6ff', c: '#2563eb' },
    { l: 'Done', n: summary.done, bg: '#f0fdf4', c: '#16a34a' },
    { l: 'Doing', n: summary.doing, bg: '#fffbeb', c: '#d97706' },
    { l: 'Overdue', n: summary.overdue, bg: '#fef2f2', c: '#dc2626' },
  ];
  const statHtml = cols.map(s =>
    `<td style="width:25%;text-align:center;padding:0 4px"><div style="background:${s.bg};border-radius:8px;padding:10px 8px"><div style="font-size:22px;font-weight:700;color:${s.c}">${s.n}</div><div style="font-size:10px;color:#6b7280;margin-top:2px">${s.l}</div></div></td>`
  ).join('');

  const sentAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:620px;margin:0 auto">
<div style="background:#0f172a;padding:22px 28px;border-radius:12px 12px 0 0">
  <h1 style="margin:0;font-size:18px;color:#5b7cfa;font-weight:700">PIRAMID BD Management</h1>
  <p style="margin:5px 0 0;font-size:12px;color:#94a3b8">${he(period)} ${he(rule.level)} Report &middot; ${he(windowLabel)}</p>
</div>
<div style="background:#fff;padding:22px 28px;border:1px solid #e5e7eb;border-top:none">
  <p style="margin:0 0 18px;color:#374151;font-size:14px">${greeting}</p>
  <table style="width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:18px"><tr>${statHtml}</tr></table>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
    <thead><tr style="background:#f8fafc">
      <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb">Task</th>
      <th style="padding:8px 8px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb">Status</th>
      <th style="padding:8px 8px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb">Owner &middot; Due</th>
    </tr></thead>
    <tbody>${taskRows}</tbody>
  </table>
</div>
<div style="background:#f8fafc;padding:12px 28px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;text-align:center">
  <p style="margin:0;font-size:11px;color:#9ca3af">PIRAMID BD Management &middot; <a href="https://bdmgmt.vercel.app" style="color:#5b7cfa;text-decoration:none">bdmgmt.vercel.app</a> &middot; ${he(sentAt)}</p>
</div>
</div></body></html>`;

  const textLines = [subject, '', greeting, '', `Period: ${windowLabel}`, `Total: ${summary.total}  Done: ${summary.done}  Doing: ${summary.doing}  Overdue: ${summary.overdue}`, ''];
  Object.entries(byProj).forEach(([pname, pts], pi) => {
    textLines.push(`${pi + 1}. ${pname}`);
    pts.forEach((t, si) => {
      const b = isOverdue(t) ? 'Overdue' : t.status === 'Done' ? 'Done' : t.status;
      textLines.push(`   ${si + 1}) ${t.title} [${b}] due:${t.due || '-'} owner:${ownerNames(state, t).join(',') || '-'}`);
    });
  });
  if (!tasks.length) textLines.push('ไม่มีงานในช่วงเวลานี้');
  textLines.push('', '-- PIRAMID BD Management  https://bdmgmt.vercel.app');

  return { subject, html, text: textLines.join('\n') };
}

export default async function handler(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  if (!['GET', 'POST'].includes(req.method)) { send(405, { error: 'Method not allowed' }); return; }
  if (!process.env.DATABASE_URL) { send(500, { error: 'DATABASE_URL not configured' }); return; }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT data FROM bd_app_state WHERE id = ${'piramid-bd-management'} LIMIT 1`;
    if (!rows.length || !rows[0].data) { send(200, { ok: true, processed: 0, reason: 'no state in DB' }); return; }

    const state = rows[0].data;
    const enabledRules = (state.rules || []).filter(r => r.enabled);
    if (!enabledRules.length) { send(200, { ok: true, processed: 0, reason: 'no enabled rules' }); return; }

    const bkk = bangkokNow();
    const currentHour = bkk.getHours();
    const currentMin = bkk.getMinutes();
    const currentDay = bkk.getDay();   // 0=Sun, 1=Mon
    const currentDate = bkk.getDate();
    const todayKey = dateKey(bkk);

    const worker = new EmailQueueWorker();
    const fired = [];

    for (const rule of enabledRules) {
      const [ruleHour] = (rule.time || '08:00').split(':').map(Number);
      if (currentHour !== ruleHour) continue;
      if (currentMin > 14) continue; // only fire in first 15 min of the scheduled hour

      const period = rule.reportPeriod || 'Daily';
      if (period === 'Weekly' && currentDay !== 1) continue;  // Monday only
      if (period === 'Monthly' && currentDate !== 1) continue; // 1st of month only

      // Build date window matching client-side reportWindow()
      const winEnd = new Date(bkk); winEnd.setHours(23, 59, 59, 999);
      const winStart = new Date(bkk); winStart.setHours(0, 0, 0, 0);
      if (period === 'Weekly') winStart.setDate(winStart.getDate() - 6);
      else if (period === 'Monthly') winStart.setDate(winStart.getDate() - 29);
      const winStartKey = dateKey(winStart);
      const windowLabel = `${fmtDate(winStart)} - ${fmtDate(winEnd)}`;

      // BD team member IDs
      const bdIds = new Set((state.teams || []).filter(m => /bd/i.test(m.role || '')).map(m => m.id));
      const isBd = t => [t.owner, ...(t.owners || [])].some(id => bdIds.has(id));

      // Tasks in window, owned by BD team
      const tasks = (state.tasks || []).filter(t =>
        isBd(t) && t.due && t.due >= winStartKey && t.due <= todayKey
      );

      const { subject, html, text } = buildEmail(rule, tasks, state, windowLabel);

      const recipients = (rule.recipients || '').split(/[\s,;]+/).filter(e => /\S+@\S+\.\S+/.test(e));
      if (!recipients.length) {
        console.warn(`[notify-cron] rule "${rule.name}" has no valid recipients — skipping`);
        continue;
      }

      await worker.enqueue({
        to: recipients[0],
        cc: recipients.slice(1),
        subject,
        html_body: html,
        text_body: text,
        related_module: 'notifications',
        related_record_id: rule.id,
        triggered_by_user: 'cron',
      });
      fired.push(rule.name || rule.id);
    }

    if (fired.length) {
      await worker.processDue(fired.length + 5);
    }

    send(200, { ok: true, processed: fired.length, rules: fired, time: bkk.toISOString() });
  } catch (err) {
    console.error('[notify-cron]', err);
    send(500, { error: err.message });
  }
}
