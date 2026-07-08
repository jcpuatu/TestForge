# TestForge — Setup Guide

A TestRail-style test case management app (full-stack: Node/Express/Prisma backend + React frontend). This guide gets it running from a zipped copy of the project.

## 1. Prerequisites

Install these first if you don't have them:
- **Node.js v20 or later** — https://nodejs.org (npm comes bundled with it)

Nothing else is required — the database is a local SQLite file, no separate database server needed.

## 2. Unzip and open a terminal

Extract the zip anywhere, then open a terminal (PowerShell on Windows, Terminal on Mac/Linux) **in the project's root folder** (the one containing `package.json`, `server/`, and `client/`).

## 3. Clean out anything platform-specific

If the zip included a `node_modules` folder (it shouldn't, but check), delete it before continuing — it contains compiled binaries specific to the machine it was zipped on and will not work on a different computer:

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force node_modules, server\node_modules, client\node_modules -ErrorAction SilentlyContinue
```
```bash
# Mac/Linux
rm -rf node_modules server/node_modules client/node_modules
```

If you want a completely fresh start (no carried-over data), also delete the database file:
```powershell
Remove-Item server\prisma\dev.db -ErrorAction SilentlyContinue
```
Otherwise leave it — if `server/prisma/dev.db` exists, whatever projects/cases/runs were in it will already be there when the app starts.

## 4. Install dependencies

From the project root:
```powershell
npm install
```
This installs both the `server` and `client` workspaces (it's an npm-workspaces monorepo, one install covers both) and downloads the correct native Prisma binary for **this** machine.

## 5. Set up environment files

Check whether `server/.env` and `client/.env` already exist (the zip may have included them). If they're **missing**, create them:

```powershell
cd server
copy ..\.env.example .env
cd ..\client
```
Create `client/.env` with:
```
VITE_API_BASE_URL="http://localhost:4000/api/v1"
```

The defaults in `.env.example` are fine for local use — they're not real secrets, just dev placeholders.

## 6. Set up the database

From the project root:
```powershell
cd server
npx prisma migrate dev
npx tsx prisma/seed.ts
cd ..
```
- `prisma migrate dev` creates `server/prisma/dev.db` and applies the schema (skips cleanly if the db already exists and is up to date).
- `prisma/seed.ts` seeds 4 demo users and a populated "Online Banking" demo project — it's safe to re-run; it skips seeding if that data already exists.

## 7. Run it

From the project root:
```powershell
npm run dev
```
This starts both the API server (port 4000) and the web app (port 5173) together. Once you see both report "ready," open:

**http://localhost:5173**

Log in with any of these seeded accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@testforge.local` | `ChangeMe123!` |
| Lead | `lead@testforge.local` | `LeadPass123!` |
| Tester | `tester@testforge.local` | `TesterPass123!` |
| Viewer | `viewer@testforge.local` | `ViewerPass123!` |

API docs (Swagger UI): http://localhost:4000/api/v1/docs

## Troubleshooting

**`Error: listen EADDRINUSE: address already in use :::4000`**
Something else is already using port 4000 or 5173 — most likely a previous `npm run dev` still running in another terminal window that was never stopped. Close that terminal (or press `Ctrl+C` in it), then try again. On Windows you can also find and kill it manually:
```powershell
netstat -ano | findstr :4000
taskkill /F /PID <the PID number from the output>
```

**Prisma errors mentioning a missing engine / `.node` file / wrong platform**
This means `node_modules` (or specifically `node_modules/.prisma`) came from a different operating system or CPU architecture than the one you're running on now. Delete `node_modules` (see step 3) and re-run `npm install`.

**"table does not exist" errors**
The database wasn't migrated. Re-run `npx prisma migrate dev` from inside `server/`.

**Port 5173 says "in use, trying another one" and picks 5174 instead**
The client will still work, just at `http://localhost:5174` instead — but check `client/.env`'s `VITE_API_BASE_URL` still points at the right server port (4000), and note the *server* may have failed to start for the same reason (see the EADDRINUSE fix above) — check that terminal output too, a working client with a dead server will fail every request.

## What's included

Full feature list, architecture notes, and data model rationale are documented in `CLAUDE.md` (project root) and `server/CLAUDE.md` / `client/CLAUDE.md` — worth a read if you're going to modify the code, not just run it.
