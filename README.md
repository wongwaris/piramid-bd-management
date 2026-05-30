# PIRAMID BD Management

Business Development platform for **PIRAMID Solutions Co., Ltd.** — a single-page
web app for managing the BD pipeline, projects, tasks, team and reporting, with
two configurable BI-style dashboards (Executive & Insights Analytics).

> Version 1.0.0

## Features

- **Executive** — real-time snapshot: KPIs, project status, solutions mix, team KPI/workload, watchlists.
- **Insights Analytics** — retrospective analysis: trends, Win/Loss, conversion funnel, Brand vs PIRAMID scope.
- **BI dashboard engine** — drag/resize/align cards, show-hide, layout checkpoints, and a custom card builder
  (source × dimension × measure × chart type) on both dashboards.
- **Projects** — full CRUD, system/brand scope with per-item value, task templates, progress tracking.
- **Task Tracker** — Kanban board + due-date calendar.
- **Team** — members, sales targets, per-member colors.
- **Notifications** — email rules (Member/Manager/Executive), templates, queue, logs, and an **Activity Log** timeline.
- **Settings** — data lists: project/task status, solutions, brand scope, task templates, size ranges.
- **Themes** — Dark & Light, responsive, touch-friendly editing.

## Tech stack

- Front end: single-file `index.html` (vanilla JS + CSS, no build step). `piramid-dashboard.html` is a synced copy used by the Netlify entry redirect.
- Serverless API: `api/` (Vercel/Netlify functions)
- Database: Neon Postgres (`@neondatabase/serverless`)
- Email: `nodemailer` with a queue/log layer in `lib/email/`

## Project structure

```
index.html              # the application (UI + logic)
piramid-dashboard.html  # synced copy (Netlify _redirects target)
api/                    # serverless endpoints (state, email)
lib/email/              # email service, queue worker, repositories
migrations/             # SQL for email/notification tables
supabase-schema.sql     # base app_state table
test/                   # node --test unit tests
```

## Setup

1. `npm install`
2. Create a Neon Postgres database and run the SQL in `supabase-schema.sql` and `migrations/`.
3. Configure environment variables (see `.env.example`) in your hosting provider.
4. Deploy to Vercel (`vercel --prod`) or Netlify.

## Development

```bash
npm test        # run unit tests (node --test)
```

## Security notes

- SMTP and database secrets live **only** in environment variables — never in the database or client.
- `POST /api/state` sanitizes incoming data (strips HTML/script) and can be gated with `STATE_WRITE_KEY`.
- User credentials are stored in app state; rotate the default access codes after first login.

© PIRAMID Solutions Co., Ltd.
