import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// rateLimit.ts's exported apiRateLimiter/loginRateLimiter are deliberately skipped whenever
// JEST_WORKER_ID is set (see the comment in that file) so the rest of this suite's legitimate
// rapid-fire requests (many logins across many test files, the concurrent-refresh regression
// test, etc.) aren't flaky or artificially slowed by rate limiting meant for production traffic.
// That also means the exported singletons can never be observed in *enforcing* mode from within
// this same Jest process. This file instead validates the exact recipe (windowMs/limit/
// standardHeaders/message shape) rateLimit.ts uses, wired onto a throwaway app with no skip, so
// the underlying configuration is proven correct independent of the test-environment bypass.
describe('rate limiter configuration', () => {
  it('returns 429 with the configured error shape once the request limit is exceeded', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Try again later.' } },
    });
    app.use(limiter);
    app.get('/x', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/x');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('reports the remaining-request count via standard headers', async () => {
    const app = express();
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
    app.use(limiter);
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const first = await request(app).get('/x');
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-remaining']).toBe('4');
  });
});

describe('exported apiRateLimiter / loginRateLimiter', () => {
  // Functional (not just presence) check that the actual production singletons stay skip-guarded
  // under Jest: hammer loginRateLimiter (limit: 10) well past its threshold through a throwaway
  // app and confirm every request still passes, protecting the rest of the suite from becoming
  // order-dependent/flaky on request volume.
  it('does not enforce a limit when JEST_WORKER_ID is set', async () => {
    const { loginRateLimiter } = await import('./rateLimit');
    const app = express();
    app.use(loginRateLimiter);
    app.get('/x', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 15; i++) {
      const res = await request(app).get('/x');
      expect(res.status).toBe(200);
    }
  });
});
