# TestForge

A full-stack [TestRail](https://www.testrail.com/) clone — test case management, test execution, planning, reporting, a documented REST API, CSV import/export, and outbound webhooks. Built as a portfolio project demonstrating full-stack engineering (Node/Express/Prisma backend, React/TypeScript frontend), and designed to be an actually-usable internal test case management tool, not just a demo.

## Screenshots

| Projects | Test case management | Test run execution |
|---|---|---|
| ![Projects](docs/screenshots/dashboard.png) | ![Test cases](docs/screenshots/test-cases.png) | ![Test run](docs/screenshots/test-run.png) |

## Features

- **Test case management** — Projects → Suites → Sections (nested tree) → Test Cases, with priority/type fields, step-by-step instructions, and CSV import/export
- **Test execution** — create a run by snapshotting all (or selected) cases from a suite, execute with pass/fail/blocked/retest statuses, per-test comments and defect links, full result history
- **Assignment & to-do** — assign individual tests to team members; a cross-project "My Tests" view shows everything assigned to you in still-open runs
- **Planning** — Test Plans group multiple runs together, optionally tied to a Milestone (due dates, completion tracking, nesting)
- **Reporting** — project dashboard with stat tiles and pass/fail/blocked/retest breakdown charts per run
- **REST API** — versioned (`/api/v1`), documented with OpenAPI/Swagger UI, dual auth (session JWT or long-lived API key)
- **Webhooks** — outbound HMAC-signed notifications on run created/completed and case created events, with a delivery log and test-ping button
- **Auth & RBAC** — JWT access tokens + rotating opaque refresh tokens (reuse-detection), API keys, four roles (Admin/Lead/Tester/Viewer) enforced server-side
- **Admin UI** — user provisioning (no public self-registration, matching real TestRail), self-service API key management

## Tech stack

**Server:** Node.js · TypeScript · Express · Prisma (SQLite) · Zod · Jest/Supertest · swagger-ui-express
**Client:** React · TypeScript · Vite · Tailwind CSS v4 · TanStack Query · React Router · lucide-react
**Monorepo:** npm workspaces

## Quick start

```bash
npm install
cd server && npx prisma migrate dev && npx tsx prisma/seed.ts && cd ..
npm run dev
```
Open **http://localhost:5173** and log in with `admin@testforge.local` / `ChangeMe123!` (three more demo accounts — Lead/Tester/Viewer — are listed in [SETUP.md](SETUP.md)).

API docs: http://localhost:4000/api/v1/docs

For detailed setup steps, troubleshooting, and what to do if you're running this from a zipped copy on a different machine, see **[SETUP.md](SETUP.md)**.

## Architecture notes

Data model rationale, auth design, and module-by-module conventions are documented in [CLAUDE.md](CLAUDE.md) (root), [server/CLAUDE.md](server/CLAUDE.md), and [client/CLAUDE.md](client/CLAUDE.md) — written to onboard a new contributor (human or AI) to the codebase's non-obvious decisions, not just what the code does.

## Testing

```bash
npm test   # server: Jest + Supertest, 26 tests across auth/cases/runs/plans/milestones/csv/webhooks/assignment
```
Every frontend flow was additionally browser-verified end-to-end (not just typechecked) during development — see the client README notes for details.

## Roadmap

Deliberately out of scope for v1 (see [CLAUDE.md](CLAUDE.md) for the full list): custom fields per project, run configurations/matrix, attachments, per-project roles, Postgres deployment path, CI pipeline.

## License

Personal portfolio project — no license file yet; treat as all-rights-reserved unless you hear otherwise from the author.
