import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

const EMAIL = 'admin@example.com';
const PASSWORD = 'CorrectHorse123!';

beforeAll(async () => {
  await prisma.user.create({
    data: { email: EMAIL, name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword(PASSWORD) },
  });
});

describe('POST /api/v1/auth/login', () => {
  it('succeeds with correct credentials and sets a refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(EMAIL);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/refresh_token=/);
  });

  it('rejects an incorrect password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('matches email case-insensitively', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: EMAIL.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid access token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);
  });

  // Regression test: requireAuth's JWT branch used to trust the token's embedded id/role for its
  // whole lifetime with zero DB lookup — deactivating (or demoting) a user had no effect on
  // anyone already holding a live access token until it naturally expired. The API-key branch
  // already re-read the user on every request; the JWT branch now does too.
  it('stops honoring an access token immediately after the user is deactivated', async () => {
    const user = await prisma.user.create({
      data: { email: 'deactivate-me@example.com', name: 'Temp', role: 'ADMIN', passwordHash: await hashPassword(PASSWORD) },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const token = login.body.accessToken;
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('uses the user\'s current role, not the role embedded in the token, after a role change', async () => {
    const user = await prisma.user.create({
      data: { email: 'demote-me@example.com', name: 'Temp2', role: 'ADMIN', passwordHash: await hashPassword(PASSWORD) },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const token = login.body.accessToken;
    expect((await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { role: 'VIEWER' } });

    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token cookie on every use', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const loginCookie = login.headers['set-cookie']![0].split(';')[0];
    const refreshed = await agent.post('/api/v1/auth/refresh');
    const refreshedCookie = refreshed.headers['set-cookie']![0].split(';')[0];
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshedCookie).not.toBe(loginCookie);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const staleCookie = login.headers['set-cookie']![0];

    // Rotate once using the original cookie — this is the legitimate use.
    const firstRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', staleCookie);
    expect(firstRefresh.status).toBe(200);
    const rotatedCookie = firstRefresh.headers['set-cookie']![0];

    // Replaying the now-stale (pre-rotation) cookie must be rejected and flagged as reuse.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', staleCookie);
    expect(replay.status).toBe(401);

    // The rotated cookie issued by the legitimate refresh should now also be dead (whole family revoked).
    const followUp = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedCookie);
    expect(followUp.status).toBe(401);
  });

  // Regression test: the read-then-revoke sequence used to be non-atomic — two genuinely
  // concurrent requests presenting the SAME not-yet-rotated token could both read it as valid
  // and both successfully rotate it, so reuse-detection never fired at all. Firing two real
  // parallel requests (not sequential awaits) reproduces that race; the fix makes exactly one of
  // them win the atomic claim.
  it('only allows one of two genuinely concurrent refreshes of the same token to succeed', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const cookie = login.headers['set-cookie']![0];

    const [a, b] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);

    const statuses = [a.status, b.status].sort();
    // Exactly one request wins the race (200); the other loses it (401, reuse detected) — never
    // both succeeding, which is what the pre-fix non-atomic version allowed.
    expect(statuses).toEqual([200, 401]);
  });
});
