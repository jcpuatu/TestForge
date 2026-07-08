# TestForge

## What this project is
A full-stack TestRail clone — test case management (projects, suites, sections, cases), test execution (runs, results, pass/fail history), planning (plans, milestones), reporting, a documented REST API, CSV import/export, and outbound webhooks. Built as both a portfolio piece (demonstrating full-stack engineering beyond QA automation, alongside the [parabank-playwright](https://github.com/jcpuatu/parabank-playwright) and [parabank-api-tests](https://github.com/jcpuatu/parabank-api-tests) portfolio projects) and an actually-usable internal test case management tool.

**Status: functionally complete v1.** All planned phases are built, tested, and browser-verified. See Roadmap below for what's deliberately out of scope vs. what's a natural next increment.

## Tech stack
- **Server:** Node + TypeScript + Express + Prisma (SQLite in dev, Postgres-portable) + Zod + Jest/Supertest + swagger-ui-express
- **Client:** React + TypeScript + Vite + Tailwind CSS v4 + TanStack Query + React Router
- **Monorepo:** npm workspaces (`server`, `client`)

## Project structure
```
testforge/
├── server/
│   ├── prisma/schema.prisma      ← full data model
│   ├── prisma/seed.ts            ← seeds 4 demo users + a fully-populated "Online Banking" project
│   └── src/
│       ├── modules/               ← one folder per resource: routes.ts (+ service.ts, schema.ts, *.test.ts)
│       │   auth/ users/ projects/ suites/ sections/ cases/ runs/ results/
│       │   milestones/ plans/ reports/ webhooks/
│       ├── middleware/            ← requireAuth (JWT + API key), requireRole (RBAC)
│       ├── lib/                   ← jwt, password hashing, opaque tokens, csv, webhook-dispatcher, errors
│       ├── openapi/spec.ts        ← hand-authored OpenAPI 3.0 doc, served at /api/v1/docs
│       └── app.ts / server.ts
└── client/
    └── src/
        ├── api/                   ← typed fetch client per resource
        ├── features/               auth/ projects/ cases/ runs/ milestones/ plans/ reports/ webhooks/ admin/
        ├── components/             shared UI primitives (Button, Input, Badge, StackedStatusBar)
        ├── layouts/AppShell.tsx    top bar with Users/API Keys admin links
        └── routes/ProtectedRoute.tsx  (supports requireRole for admin-only routes)
```

## Data model — key decisions
- **SQLite has no native enum or Json type support** (validated the hard way — Prisma migration fails on both). All "enum-like" fields (`Role`, `Priority`, `CaseType`, `ResultStatus`, `WebhookEvent`) are `String` in the schema, validated at the API boundary via Zod and typed as literal unions in TS (`server/src/types/roles.ts`). Test-case `steps` are `String?` (JSON-serialized), converted to/from an array at the API boundary (`server/src/modules/cases/serialize.ts`, `runs/serialize.ts`).
- **`RunCase` snapshots case content** (title/steps/expected/priority) at run-creation time rather than just referencing `TestCase` — editing or deleting a case must not corrupt historical run results. `TestCase` uses a soft-delete flag (`isDeleted`) for the same reason.
- **`RunCase.status` is denormalized** for fast list queries; `Result` is append-only history (one row per status change/retest). Submitting a result (`POST /tests/:id/results`) updates both in one transaction (`server/src/modules/results/routes.ts`).
- **`Section`/`Milestone` self-relate via `parentId`** with `onDelete: Restrict` (not Cascade) — deleting reparents children in application code, it does not cascade-delete the subtree.
- **IDs are `cuid()` strings** everywhere — portable to Postgres, non-enumerable.
- **DATABASE_URL gotcha:** Prisma resolves relative SQLite paths against the directory containing `schema.prisma` (`server/prisma/`), not the process cwd. `DATABASE_URL="file:./dev.db"` in `server/.env` therefore resolves to `server/prisma/dev.db`. Using `file:./prisma/dev.db` doubles the path into `server/prisma/prisma/dev.db` — a mistake this project's history already made once.

## Auth design
- **Web app:** JWT access token (~15 min, returned in the login/refresh response body, kept in memory only on the client — never persisted) + an **opaque, rotating** refresh token in an httpOnly cookie (`server/src/modules/auth/service.ts`). Refresh tokens are stored only as a hash, rotated on every use, with **reuse-detection**: presenting an already-rotated token revokes the entire token family. No public self-registration — users are admin-provisioned (`POST /api/v1/users`, or the Users admin UI at `/admin/users`), matching real TestRail.
- **REST API:** API keys (`tf_` prefix, SHA-256 hash stored, raw key shown once at creation — self-service UI at `/account/api-keys`) sent as `Authorization: Bearer <key>`, handled by the same `requireAuth` middleware as JWT.
- **Client-side concurrency note:** the refresh call is deduped through a single in-flight promise (`client/src/lib/apiClient.ts` → `refreshSession()`), shared between the automatic 401-retry path and `AuthProvider`'s boot-time silent refresh. This was a real bug caught by browser testing — React StrictMode's double-effect-mount fired two concurrent `/auth/refresh` calls, and the second one tripped reuse-detection and could have revoked the session it had just created.
- **RBAC:** `requireRole(...roles)` middleware server-side; global `Role` (`ADMIN`/`LEAD`/`TESTER`/`VIEWER`) on `User`, not per-project. Roughly: ADMIN/LEAD manage structure (projects/suites/sections/runs/plans/milestones/webhooks/users), TESTER can additionally author cases and submit results, VIEWER is read-only. Client-side `ProtectedRoute` also accepts a `requireRole` prop for route-level gating (e.g. `/admin/users`), but the server is the actual enforcement point.

## Testing note — Prisma client + Jest
`server/src/config/prisma-client.ts` normally caches a `PrismaClient` singleton on `global` (for dev hot-reload). Under Jest, `global` persists across test files run in the same worker, which leaked one file's client (bound to its own isolated `DATABASE_URL`) into the next file's tests and caused "table does not exist" failures. Fixed by skipping the global-cache path when `process.env.JEST_WORKER_ID` is set — each test file gets its own fresh client. See `server/src/test/setup.ts` for how each file gets an isolated SQLite database.

## How to run
```powershell
cd "C:\Claude Apps\testforge"
npm install
cp .env.example server/.env   # already done; edit if you need different secrets
cd server && npx prisma migrate dev && npx tsx prisma/seed.ts && cd ..
npm run dev                    # starts server (:4000) + client (:5173) together
```
Seeded logins (all from `prisma/seed.ts`): `admin@testforge.local` / `ChangeMe123!` (ADMIN), `lead@testforge.local` / `LeadPass123!` (LEAD), `tester@testforge.local` / `TesterPass123!` (TESTER), `viewer@testforge.local` / `ViewerPass123!` (VIEWER). The seed also creates a populated "Online Banking" demo project (2 suites, 5 cases, 1 milestone, 1 plan, 1 run with results).

```powershell
npm test                       # server Jest+Supertest suite (36 tests across auth/cases/runs/plans/milestones/csv/webhooks/me/defects)
```
API docs: http://localhost:4000/api/v1/docs (Swagger UI) / http://localhost:4000/api/v1/openapi.json (raw spec).

## What's built
- **Auth & users** — login/refresh/logout, RBAC, admin-provisioned users, API keys (backend + admin UI)
- **Cases** — Project → Suite → Section (nested tree, reparent-on-delete) → TestCase, full CRUD, CSV import/export
- **Runs** — create (snapshot all-or-selected cases from a suite), execution UI (pass/fail/blocked/retest + comments/defects + per-test assignee picker), result history, close/reopen. Assignment also supports **bulk operations**: checkbox-select rows + a bulk action bar ("N selected → assign to X"), plus a one-click "Assign all N unassigned to me" shortcut — both go through a real batched `POST /runs/:id/tests/bulk-assign` endpoint, not N individual requests.
- **My Tests** (`/my-tests`) — cross-project "assigned to me, in still-open runs" view, TestRail's dashboard to-do equivalent; `GET /users/directory` exposes a minimal (id/name/role) active-user list to any authenticated user so non-admins can populate assignee pickers
- **Plans & Milestones** — plans group runs, optionally tied to a milestone; milestones support due dates, completion, nesting
- **Reporting** — project dashboard (stat tiles + per-run stacked status bars, palette validated via the dataviz skill's contrast/CVD checker)
- **REST API** — versioned `/api/v1`, documented via OpenAPI/Swagger UI, dual auth (JWT or API key)
- **Webhooks** — outbound HMAC-signed POST on `RUN_CREATED`/`RUN_COMPLETED`/`CASE_CREATED`, delivery log, test-ping button
- **Defect linking (Jira stand-in, not a real integration)** — `Result.defects` is free text (comma-separated IDs/URLs), rendered as a clickable link when it looks like a URL (`client/src/components/DefectText.tsx`); a red bug icon appears on a test row when its latest result is Failed/Blocked with a defect attached; the Defect IDs input autocompletes from defect IDs already used elsewhere in the project. A **Defects tab** (`GET /projects/:id/defects`) rolls up every defect ID across the project — reference count, how many cases are still failing vs. look resolved, last-seen date. A **"Draft defect for Jira"** panel on each test auto-generates a title/description (steps, expected/actual, environment, reporter, deep link back to TestForge) with a copy-to-clipboard button, plus an optional locally-saved Jira "create issue" URL for one-click prefill (real Jira feature, no API key needed, best-effort on newer Jira Cloud UIs). A run's **"Export defects CSV"** button bulk-exports every Failed/Blocked test as a Jira-bulk-import-shaped CSV (Summary/Description/Issue Type/Priority/Labels) — reuses the same `lib/csv.ts` encoder as case import/export. None of this talks to a real Jira instance — a genuine push-to-Jira integration (create + live status sync) would need real Jira credentials to build and test against, which isn't available; this is the deliberate middle ground that needed none.

## Roadmap — natural next increments (not started)
- **Attachments** on cases/results (screenshots) — flagged repeatedly during design as a likely reviewer expectation
- **Custom fields per project** and **run configurations/matrix** — real TestRail's biggest complexity sinks, deliberately deferred
- **Per-project roles** (vs. the current global role) — `ProjectMember` join table is the natural extension
- **Section drag-and-drop reorder** — `orderIndex` field already exists, just needs a `/move` endpoint + UI
- **Postgres deployment path** — swap `datasource.provider` to `postgresql`, re-run `prisma migrate`, update `DATABASE_URL`; enums/JSON become native (currently String-encoded for SQLite compatibility) — worth revisiting whether to switch to native types post-migration
- **CI** — no GitHub Actions workflow yet (build/test/typecheck on push)

## GitHub
Not yet pushed to a remote.
