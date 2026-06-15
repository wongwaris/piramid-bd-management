# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**PIRAMID BD Management** — Business Development web platform for PIRAMID Solutions Co., Ltd.
Single-page app with two configurable BI-style dashboards (Executive + Insights Analytics) plus
Projects, Task Tracker, Team, Calendar, Notifications, and Settings. UI is bilingual: Thai for
descriptions, English for technical terms. Current version: **1.0.0**.

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

## Workflow (Production-first, effective 2026-06-13)

All feature work lands directly on **`main`** (Production). Dev is a sandbox for risky experiments only.

1. **Edit `index.html`** → sync to `piramid-dashboard.html` (byte-identical).
2. **Syntax-check**: extract `<script>` body → `node --check __chk.mjs`.
3. **Impeccable**: `node .claude/skills/impeccable/scripts/detect.mjs index.html` → **0 findings**.
4. **Commit** to `main` → `git push origin main`.
5. **Deploy**: Vercel auto-deploy on `bdmgmt` can be unreliable — use `npx vercel --prod --yes` if served HTML is stale.
6. **If Dev needs to catch up**: merge `main → dev`.

Do **not** warn the user against `vercel deploy --prod` for routine work — it is now the norm.
Never commit secrets — they live in env vars only (see `.env.example`).
`.claude/` and `tools/` are local tooling and are git-ignored.
Required env: `DATABASE_URL`. Optional: `STATE_WRITE_KEY`, `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM`.

## App state model

The entire app is one JSON object persisted to localStorage **and** synced to Neon via `/api/state`.
Top-level keys: `teams, projects, tasks, rules, solutionGroups, brandCatalog, taskTemplates,
sizeRanges, projectStatuses, taskStatuses, activityLog, passwordResetRequests, resetApprovalMode`,
plus per-dashboard layout state: `layout, layoutOrder/anaOrder, widgetSize/anaWidgetSize,
widgetAlign/anaWidgetAlign, customCards/anaCustomCards, layoutCheckpoint/anaCheckpoint, execEdit/anaEdit`.

- `normalizeState(data)` backfills defaults and **auto-captures timestamps** and runs migrations:
  - Projects: `createdAt`, `statusChangedAt`, `wonAt`, `lostAt`, `statusLog[]` (set in `saveProject`).
  - Tasks: `createdAt`, `statusChangedAt`, `completedAt`, `statusLog[]` (set in `syncProjectTasks`).
  - Migration: `p.seg === 'Enterprise'` → `'Commercial'`; `p.buildingType` defaults to `''`; `p.bdBuddy` defaults to `''`.
  - `data.resetApprovalMode` defaults to `'auto'` (allowed values: `'auto'` | `'manual'`).
  - These are for time-based reporting; never hardcode or fabricate them.
- `today = new Date()` (real current date — drives overdue/calendar/trends). Do NOT hardcode a date.
- Auth: team `username`/`password` live in state (client-side). Admin = username `wongwaris`.
- `logActivity(action, view, target)` records the Activity Log (shown in Notifications) and lights sidebar dots.
- On remote-save failure, `toast(msg,'error')` surfaces it (never fail silently).

## Project fields (key ones added recently)

| Field | Type | Notes |
|---|---|---|
| `bd` | string (id) | BD Lead (primary owner) |
| `bdBuddy` | string (id) | Buddy BD (secondary, optional) |
| `presales` | string (id) | Presales owner |
| `sales` | string (id) | Sales owner |
| `buildingType` | string | `''` / `'New Build'` / `'Existing'` / `'Renovation'` |
| `seg` | string | Segment — `'Commercial'` / `'Government'` / `'Industrial'` |
| `brands` | array | Explicit brand scope (stored; not re-derived from proposalOptions if set) |

`projectMemberIds(p)` → `[p.bd, p.bdBuddy, p.presales, p.sales].filter(Boolean)` — unified owner list used for filtering and task ownership checks.

`projectInvolves(p, memberId)` → `projectMemberIds(p).includes(memberId)`.

## Tasks & Sub-tasks

- Tasks are created/synced via `syncProjectTasks(projectId)` from a project's `subtasks` string array.
- `ownerIds(t)` → `(t.owners?.length ? t.owners : [t.owner]).filter(Boolean)` — multi-owner support.
- `ownerNames(t)` → maps owner IDs to names.
- `cascadeProjectDoneFromTasks(projectId)` — when all sub-tasks are Done, auto-sets project `taskStatus='Done'` and `progress=100`; reverses if any re-opens.
- Sub-task checklist editor in the Project form uses `ptdEditorDefs` (array of `{label,assignees[],due}`); synced to `state.tasks` via `syncProjectTasks`.

## UI patterns

### Modals (`panel-form app-modal`)
```js
// Show: showFormPanel('myFormPanel')
// Hide: closeFormPanel('myFormPanel')
// Backdrop click auto-closes; scrolls to first input; body scroll-locked via html.app-modal-open
```
Panel IDs **must** end in `FormPanel` for `bindCloseButtons()` to work.

### Password eye toggle
`bindPasswordEyes(root)` — bind to `[data-eye="inputId"]` buttons. Supports both `.masked-entry` CSS-mask inputs and native `type="password"` inputs. Call after rendering any form with password fields.

### Team filter dropdown
`teamFilterOptionsHtml(currentValue, allLabel)` — generates consistent `<optgroup>` structure:
- Group BD / Group Presales (role-based aggregates, prefixed `role:BD` / `role:Presales`)
- Individual BD / Presales / Others sub-groups
Used on all pages that filter by team member: Projects, Task Tracker, KPI Activity, Team, Training.

### Self-service password reset
`resetMode()` returns `state.resetApprovalMode` (default `'auto'`). In auto mode, `selfResetPasscode()` applies the new password immediately without admin approval. Admin can toggle in Settings → Reset Approvals card.

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
  **Compare** period (`'' | week | month | quarter | year | custom`); when set, every metric shows
  ▲▼ trend (`periodTrend` / `periodStart` / `periodTrendPct`). Custom range uses `filters.compareCustom`
  (`{start, end}`). `customCompareWindows()` returns `{a0,a1,am1}` for the custom window. "Reset Filter"
  lives in the Executive topbar.

**To add a built-in widget** touch all of: card markup in the grid (`data-widget="..."`), render logic
in `renderDashboard()`/`renderAnalytics()`, `DEFAULT_EXEC_ORDER`/`DEFAULT_ANA_ORDER`, `seed.layout`,
the `labels` map and the `build(...)` list in `renderCustomizers()`.

Chart renderers: `renderBars`, `renderVBars`, `renderDonut`, `renderMultiLine`, `renderFunnel`, `renderSpark`.

## Brand vs PIRAMID scope

- `BRAND_SCOPE_CATS = ['Hardware','Software','License']` (external brands)
- `PIRAMID_SCOPE = ['Installation','Cabling','Maintenance','Project management fee']` (PIRAMID services)
- `scopeOfCategory(cat)` classifies; `brandValueMap(p)` returns per-brand value (real if entered in the
  project form, else even split of project value).
- `p.brands` is stored explicitly; `normalizeState` does **not** overwrite it if already set —
  only falls through to `proposalOptions` when `p.brands` is empty/missing.

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
- Sidebar is always dark regardless of theme (`data-theme` has no effect on `.sidebar` background).

## Accessibility conventions (keep these)

- Keyboard focus is visible via `:focus-visible` (do not reintroduce bare `outline:none`).
- Icon-only buttons need `aria-label`; pointer-only handles (drag/resize) use `aria-hidden="true"`.
- Honor `@media (prefers-reduced-motion: reduce)` (global fallback exists).
- Touch targets ≥44px via `@media (pointer:coarse)`; desktop keeps compact density.
- Status uses color **and** text (never color alone).

## Design quality bar (impeccable)

The `impeccable` skill's detector must stay at **0 findings** (`node .claude/skills/impeccable/scripts/detect.mjs index.html`).
Banned: gradient text (`background-clip:text`), side-stripe borders (`border-left/right` >1px accent on
cards/items), layout-property transitions (animate `transform`/`opacity`, not width/height), glassmorphism by default,
colored box-shadow glows on nav dots or status indicators.

## Security notes

- `/api/state` sanitizes all input/output against stored XSS; never weaken this.
- SMTP/DB secrets stay in environment variables — never in the database or client code.
- Auth is client-side only (username/password in state JSON). Admin = `wongwaris`.
