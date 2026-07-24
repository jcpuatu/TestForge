// Baseline load-testing script -- run against a live dev server (`npm run dev` from the repo
// root) to get real latency/throughput numbers for the endpoints this project's optimization
// pass touched (pagination, in-memory caching). Not part of the Jest suite or CI: this measures
// wall-clock performance against a real running server, which is a different kind of check than
// correctness tests. Run with `npm run loadtest -w server`.
//
// Sets up its own small throwaway project/suite/cases/runs so results are reproducible without
// depending on whatever demo data happens to already exist, then deletes it afterward.

import autocannon from 'autocannon';

const API = process.env.LOADTEST_API_URL ?? 'http://localhost:4000/api/v1';
const ADMIN_EMAIL = 'admin@testforge.local';
const ADMIN_PASSWORD = 'ChangeMe123!';

interface Summary {
  requests: { average: number };
  latency: { average: number; p99: number };
  errors: number;
  non2xx: number;
}

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  return (await res.json()).accessToken;
}

async function post<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function timedGet(token: string, path: string): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  await res.text();
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return performance.now() - start;
}

async function run(label: string, path: string, token: string, opts: { connections?: number; duration?: number } = {}) {
  const result = (await autocannon({
    url: `${API}${path}`,
    connections: opts.connections ?? 10,
    duration: opts.duration ?? 5,
    headers: { Authorization: `Bearer ${token}` },
  })) as unknown as Summary;

  console.log(
    `${label.padEnd(38)} req/s: ${result.requests.average.toFixed(0).padStart(6)}   ` +
      `latency avg: ${result.latency.average.toFixed(1).padStart(6)}ms   p99: ${result.latency.p99.toFixed(1).padStart(7)}ms   ` +
      `errors: ${result.errors}   non2xx: ${result.non2xx}`,
  );
}

(async () => {
  console.log(`Load-testing against ${API}\n`);
  const token = await login();

  console.log('--- Setting up throwaway fixture data ---');
  const project = await post<{ project: { id: string } }>(token, '/projects', { name: `Loadtest ${Date.now()}` });
  const projectId = project.project.id;
  const suite = await post<{ suite: { id: string } }>(token, `/projects/${projectId}/suites`, { name: 'Suite' });
  const section = await post<{ section: { id: string } }>(token, `/suites/${suite.suite.id}/sections`, { name: 'Section' });
  await Promise.all(
    Array.from({ length: 150 }, (_, i) => post(token, `/sections/${section.section.id}/cases`, { title: `Case ${i}`, priority: 'MEDIUM' })),
  );
  // Sequential, not Promise.all -- unlike case-create, run-create wraps its work in a Prisma
  // $transaction (runs/service.ts's createRun), and SQLite serializes transactions against a
  // single writer. A first attempt fired all 30 concurrently and several hit real P1008
  // "operations timed out" errors -- a genuine SQLite concurrent-write limitation surfaced by
  // this exact load test, not a bug in the script. Real usage doesn't create 30 runs in one
  // simultaneous burst either, so sequential setup here is both more realistic AND avoids
  // conflating "fixture setup is slow" with "the endpoints under test are slow." See the
  // Postgres migration path already noted in root CLAUDE.md's roadmap -- this is exactly the
  // kind of concurrent-write load that motivates it.
  for (let i = 0; i < 30; i++) {
    await post(token, `/projects/${projectId}/runs`, { name: `Run ${i}`, suiteId: suite.suite.id });
  }
  console.log('Created 150 cases, 30 runs.\n');

  console.log('--- Cold vs. warm cache: project dashboard (30s TTL) ---');
  const cold = await timedGet(token, `/projects/${projectId}/dashboard`);
  const warm = await timedGet(token, `/projects/${projectId}/dashboard`);
  console.log(`cold (cache miss):  ${cold.toFixed(1)}ms`);
  console.log(`warm (cache hit):   ${warm.toFixed(1)}ms  (${(cold / warm).toFixed(1)}x faster)\n`);

  console.log('--- Sustained load (10 connections, 5s each) ---');
  await run('GET /health', '/health', token);
  await run('GET cases list (page 1, 150 total)', `/suites/${suite.suite.id}/cases`, token);
  await run('GET runs list (page 1, 30 total)', `/projects/${projectId}/runs`, token);
  await run('GET project dashboard (cached, 30s TTL)', `/projects/${projectId}/dashboard`, token);
  await run('GET cross-project dashboard (cached)', '/dashboard', token);

  console.log('\n--- Cleaning up ---');
  await fetch(`${API}/projects/${projectId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  console.log('Done.');
})().catch((err) => {
  console.error('LOAD TEST FAILED:', err);
  process.exit(1);
});
