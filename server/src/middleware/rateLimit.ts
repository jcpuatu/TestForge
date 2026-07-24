import rateLimit from 'express-rate-limit';

// Skipped entirely under Jest — rate limiting is a production/deployment concern, and the
// in-memory per-process store would otherwise make test files that legitimately log in many
// times in quick succession (exercising multiple users/roles, or the concurrent-refresh
// regression test) flaky or artificially slow for no real security benefit in a test run.
//
// Also skipped when LOADTEST_MODE=true, set only by `scripts/loadtest.ts`'s own server process
// (never in production) — same reasoning as the Jest skip: a load test wants to measure an
// endpoint's real performance, not the speed of its own 429 rejections, and this is a
// server-process-env-var gate, not anything a request itself can trigger (unlike a header or
// query param, which would be a real, request-controllable bypass and a genuine vulnerability).
const isTest = !!process.env.JEST_WORKER_ID || process.env.LOADTEST_MODE === 'true';

// A generous ceiling on the whole API — catches a runaway script or scraper without getting in
// the way of legitimate bursts (a CSV import's follow-up requests, a bulk operation, a page that
// fires several queries on load).
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

// A real anti-brute-force measure for the one endpoint that actually needs it — bcrypt's own
// cost is only a mild natural throttle on its own (see the login-timing-side-channel fix in
// auth/service.ts, a related but distinct finding from the same audit that flagged this gap).
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again later.' } },
});
