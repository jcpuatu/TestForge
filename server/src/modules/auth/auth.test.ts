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
});
