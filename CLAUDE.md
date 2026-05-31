# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**PIRAMID BD Management** — Business Development web platform for PIRAMID Solutions Co., Ltd.
Single-page app with two configurable BI-style dashboards (Executive + Insights Analytics) plus
Projects, Task Tracker, Team, Notifications, and Settings. UI is bilingual: Thai for descriptions,
English for technical terms. Current version: **1.0.0**.

Live: https://bdmgmt.vercel.app · Repo: github.com/wongwaris/piramid-bd-management

## Architecture

- **Front end is a single file: `index.html`** — all UI, CSS, and JS inline. No build step, no framework (vanilla JS).
- **`piramid-dashboard.html` is a byte-identical copy** of `index.html`, used as the Netlify entry via `_redirects`.
  ⚠️ **After ANY edit to `index.html`, copy it to `piramid-dashboard.html`** so the two stay identical.
- **Serverless API** in `api/` (runs on both Vercel and Netlify):
  - `api/state.js` — GET/POST the whole app state as one JSON row in Neon Postgres (`bd_app_state`).
    POST input is **sanitized server-side** (strips HTML/script/event handlers) and GET output is sanitized too.
    Optional write gate via `STATE_WRITE_KEY` env (header `x-bd-write-key`).
  - `api/email/*` — email endpoints (send, queue, logs, templates, settings, preferences).
- **`lib/email/*`** — email service, queue worker (retry/log), repositories. Uses `nodemailer`.
- **Database**: Neon Postgres. Base table in `supabase-schema.sql`; email/notification tables in `migrations/email-notifications.sql`.
- **Tests**: `test/email.test.js` (run `npm test` → `node --test`).

## App state model

The entire app is one JSON object persisted to localStorage **and** synced to Neon via `/api/state`.
Top-level keys: `teams, projects, tasks, rules, solutionGroups, brandCatalog, taskTemplates,
sizeRanges, projectStatuses, taskStatuses, layout, layoutOrder/anaOrder, widgetSize/anaWidgetSize,
widgetAlign/anaWidgetAlign, customCards/anaCustomCards, layoutCheckpoint/anaCheckpoint,
execEdit/anaEdit, activityLog, passwordResetRequests`.

- `normalizeState()` backfills defaults (e.g. project `createdAt`) on load.
- Auth: team `username`/`password` live in state (client-side). Admin = username `wongwaris`.
- `logActivity(action, view, target)` records the Activity Log (shown in Notifications) and lights sidebar dots.
- `today = new Date()` (real current date — drives overdue/calendar/trends). Do NOT hardcode a date.

## Dashboards (Executive & Insights Analytics)

Both share one engine, parameterized by `dk` = `'exec'` or `'ana'` via the `DASH` config object.
Features: drag-to-reorder (grip ⠿), pixel resize (corner handle), metric alignment (▦), Edit/View mode
toggle, layout Checkpoint/Reset, show/hide via Customize, and a **custom card builder** (`+ Add Card`)
driven by `BI_SOURCES` (source × dimension × measure × chart type, with chart recommendation).

**To add a built-in widget** you must touch all of:
1. card markup inside the grid (`#execGrid` / `#anaGrid`) with `data-widget="..."`
2. render logic in `renderDashboard()` / `renderAnalytics()`
3. `DEFAULT_EXEC_ORDER` / `DEFAULT_ANA_ORDER`
4. `seed.layout` defaults
5. the `labels` map in `renderCustomizers()`
6. the `build('execCustomizer'|'analyticsCustomizer', [...])` list

Chart renderers: `renderBars`, `renderVBars`, `renderDonut`, `renderMultiLine`, `renderFunnel`, `renderSpark`.

## Brand vs PIRAMID scope

- `BRAND_SCOPE_CATS = ['Hardware','Software','License']` (external brands)
- `PIRAMID_SCOPE = ['Installation','Cabling','Maintenance','Project management fee']` (PIRAMID services)
- `scopeOfCategory(cat)` classifies; `brandValueMap(p)` returns per-brand value (real if entered, else even split).

## Themes

Dark (default) and Light via `data-theme="light"` on `<html>`. Color tokens in `:root` and the
`[data-theme="light"]` block. When adding components, use CSS vars (`--accent`, `--text`, `--panel`,
`--line`, `--shadow`, `--shadow-hover`, `--card-grad`) so both themes work. Verify contrast in BOTH.

## Workflow / conventions

- **Edit `index.html` → sync to `piramid-dashboard.html`** (identical copies).
- **Syntax-check the inline script before deploying** (extract the `<script>` body, `node --check`).
- Keep Thai text UTF-8 clean — beware tools/editors that double-encode (a past bug turned Thai into mojibake).
- Deploy: `npx vercel deploy --prod --yes` (project already linked in `.vercel`).
- Commit/push only when asked. Never commit secrets — they live in env vars only (see `.env.example`).
- Required env: `DATABASE_URL`. Optional: `STATE_WRITE_KEY`, `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM`.

## Security notes

- `/api/state` sanitizes all input/output against stored XSS; never weaken this.
- SMTP/DB secrets stay in environment variables — never in the database or client code.
