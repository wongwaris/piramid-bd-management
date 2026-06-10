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
    Input **and** output are sanitized server-side (`sanitizeDeep` strips tags / `on*=` handlers / `javascript:`).
    Optional write gate via `STATE_WRITE_KEY` env (header `x-bd-write-key`).
  - `api/email/*` — email endpoints (send, queue, logs, templates, settings, preferences).
- **`lib/email/*`** — email service, queue worker (retry/log), repositories. Uses `nodemailer`.
- **Database**: Neon Postgres. Base table in `supabase-schema.sql`; email/notification tables in `migrations/email-notifications.sql`.
- **Tests**: `test/email.test.js` (run `npm test` → `node --test`).

## Environments

Two isolated environments (separate Vercel project AND separate Neon DB):

| | Production | Development |
|---|---|---|
| Vercel project | `bdmgmt` | `bdmgmt-dev` |
| URL | https://bdmgmt.vercel.app | https://bdmgmt-dev.vercel.app |
| Production Branch | `main` | `dev` |
| Database | Neon `main` | Neon `dev` branch |
| In-app badge | — | 🟡 `DEV` (auto on any non-production host) |

**Workflow: do day-to-day work on `dev`** → push (auto-deploys to the dev site + dev DB) → verify →
merge `dev` → `main` to promote to Production. Do not run `vercel deploy --prod` for routine work;
let Git auto-deploy. Secrets live only in each Vercel project's env vars.

## App state model

The entire app is one JSON object persisted to localStorage **and** synced to Neon via `/api/state`.
Top-level keys: `teams, projects, tasks, rules, solutionGroups, brandCatalog, taskTemplates,
sizeRanges, projectStatuses, taskStatuses, activityLog, passwordResetRequests`, plus per-dashboard
layout state: `layout, layoutOrder/anaOrder, widgetSize/anaWidgetSize, widgetAlign/anaWidgetAlign,
customCards/anaCustomCards, layoutCheckpoint/anaCheckpoint, execEdit/anaEdit`.

- `normalizeState()` backfills defaults and **auto-captures timestamps**:
  - Projects: `createdAt`, `statusChangedAt`, `wonAt`, `lostAt`, `statusLog[]` (set in `saveProject`).
  - Tasks: `createdAt`, `statusChangedAt`, `completedAt`, `statusLog[]` (set in `syncProjectTasks`).
  - These are for time-based reporting; never hardcode or fabricate them.
- `today = new Date()` (real current date — drives overdue/calendar/trends). Do NOT hardcode a date.
- Auth: team `username`/`password` live in state (client-side). Admin = username `wongwaris`.
- `logActivity(action, view, target)` records the Activity Log (shown in Notifications) and lights sidebar dots.
- On remote-save failure, `toast(msg,'error')` surfaces it (never fail silently).

## Dashboards (Executive & Insights Analytics)

Both share one engine, parameterized by `dk` = `'exec'` or `'ana'` via the `DASH` config object.
- **12-column CSS grid** (`#execGrid` / `#anaGrid`) with magnetic **column + row snap** resize,
  drag-to-reorder (grip ⠿), edit-mode guide lines, metric alignment (▦).
- **Edit/View mode** via `state.execEdit/anaEdit` (button id `execLockBtn/anaLockBtn`). Handles only
  show in edit mode (`.dash-grid.editing`).
- Layout **Checkpoint/Reset**, show/hide via **Customize**, and a **custom card builder** (`+ Add Card`)
  driven by `BI_SOURCES` (source × dimension × measure × chart type, with chart recommendation).
- Executive uses a 3-tier hierarchy: flat KPI band → Pipeline Value hero → elevated chart cards.
- Global **filter bar** (`#globalFilters`, Executive) drives both dashboards via `filters`, including a
  **Compare** period (`'' | week | month | quarter | year`); when set, every metric shows ▲▼ trend
  (`periodTrend` / `periodStart` / `periodTrendPct`). "Reset Filter" lives in the Executive topbar.

**To add a built-in widget** touch all of: card markup in the grid (`data-widget="..."`), render logic
in `renderDashboard()`/`renderAnalytics()`, `DEFAULT_EXEC_ORDER`/`DEFAULT_ANA_ORDER`, `seed.layout`,
the `labels` map and the `build(...)` list in `renderCustomizers()`.

Chart renderers: `renderBars`, `renderVBars`, `renderDonut`, `renderMultiLine`, `renderFunnel`, `renderSpark`.

## Brand vs PIRAMID scope

- `BRAND_SCOPE_CATS = ['Hardware','Software','License']` (external brands)
- `PIRAMID_SCOPE = ['Installation','Cabling','Maintenance','Project management fee']` (PIRAMID services)
- `scopeOfCategory(cat)` classifies; `brandValueMap(p)` returns per-brand value (real if entered in the
  project form, else even split of project value).

## Design tokens & theming

Dark (default) and Light via `data-theme="light"` on `<html>`. When adding components, use CSS vars so
both themes work, and **verify contrast in BOTH**:
- Surfaces/text: `--bg --surface --panel --panel-2 --line --line-2 --text --muted --soft --accent --accent-2`
- Depth: `--shadow --shadow-hover --card-grad`
- Spacing scale (4pt): `--space-xs/sm/md/lg/xl`
- **Chart palette**: `--chart-1..7` (+ `--progress-from/to`). JS resolves these into the `CHART[]`
  array at boot via `loadChartColors()` and re-resolves on theme switch. **Use `CHART[i]` for all chart
  series** (works in both CSS and SVG attributes); never hardcode chart hexes. Team member colors are
  user data, not part of the chart series.

## Accessibility conventions (keep these)

- Keyboard focus is visible via `:focus-visible` (do not reintroduce bare `outline:none`).
- Icon-only buttons need `aria-label`; pointer-only handles (drag/resize) use `aria-hidden="true"`.
- Honor `@media (prefers-reduced-motion: reduce)` (global fallback exists).
- Touch targets ≥44px via `@media (pointer:coarse)`; desktop keeps compact density.
- Status uses color **and** text (never color alone).

## Workflow / conventions

- **Edit `index.html` → sync to `piramid-dashboard.html`** (identical copies).
- **Syntax-check the inline script before deploying** (extract the `<script>` body, `node --check`).
- Keep Thai text UTF-8 clean — beware tools/editors that double-encode (a past bug turned Thai into mojibake).
- Routine deploy = push to `dev` (or merge to `main`); Git auto-deploys. `vercel deploy --prod` only for hotfixes.
- Commit/push only when asked. Never commit secrets — they live in env vars only (see `.env.example`).
- `.claude/` and `tools/` are local tooling and are git-ignored.
- Required env: `DATABASE_URL`. Optional: `STATE_WRITE_KEY`, `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM`.

## Design quality bar (impeccable)

The `impeccable` skill's detector must stay at **0 findings** (`node .claude/skills/impeccable/scripts/detect.mjs index.html`).
Banned: gradient text (`background-clip:text`), side-stripe borders (`border-left/right` >1px accent on
cards/items), layout-property transitions (animate `transform`/`opacity`, not width/height), glassmorphism by default.

## Security notes

- `/api/state` sanitizes all input/output against stored XSS; never weaken this.
- SMTP/DB secrets stay in environment variables — never in the database or client code.
