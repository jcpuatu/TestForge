import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

function auth(token: string = adminToken) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'users-test-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

async function createUser(email: string, role: 'ADMIN' | 'LEAD' | 'TESTER' | 'VIEWER' = 'TESTER') {
  const res = await request(app).post('/api/v1/users').set(auth()).send({ email, name: email, password: 'Password123!', role });
  return res.body.user as { id: string; email: string };
}

async function loginAs(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return res.body.accessToken as string;
}

describe('POST /api/v1/users', () => {
  it('rejects a duplicate email', async () => {
    await createUser('dup-test@example.com');
    const res = await request(app).post('/api/v1/users').set(auth()).send({ email: 'dup-test@example.com', name: 'Dup', password: 'Password123!' });
    expect(res.status).toBe(400);
  });

  // Regression test: emails were stored/compared case-sensitively, so "Test@x.com" and
  // "test@x.com" could exist as two distinct, both-loginable accounts.
  it('rejects a duplicate email that only differs by case, and normalizes storage to lowercase', async () => {
    const created = await createUser('CaseTest@Example.com');
    expect(created.email).toBe('casetest@example.com');

    const dup = await request(app).post('/api/v1/users').set(auth()).send({ email: 'casetest@EXAMPLE.com', name: 'Dup', password: 'Password123!' });
    expect(dup.status).toBe(400);
  });

  it('rejects a concurrent duplicate-email create with a clean 400, not a raw 500', async () => {
    const email = 'race-test@example.com';
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/users').set(auth()).send({ email, name: 'A', password: 'Password123!' }),
      request(app).post('/api/v1/users').set(auth()).send({ email, name: 'B', password: 'Password123!' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
  });
});

describe('DELETE /api/v1/users/:id/api-keys/:keyId', () => {
  // Regression test, confirmed-exploitable IDOR: the ownership check only verified the caller
  // owned :id, never that :keyId actually belonged to that user — any authenticated user could
  // revoke ANY other user's API key by passing their own id as :id and the victim's key id as
  // :keyId.
  it('does not let a user revoke another user\'s API key via their own :id', async () => {
    const victim = await createUser('idor-victim@example.com');
    const attacker = await createUser('idor-attacker@example.com');
    const victimToken = await loginAs(victim.email);
    const attackerToken = await loginAs(attacker.email);

    const key = await request(app).post(`/api/v1/users/${victim.id}/api-keys`).set(auth(victimToken)).send({ label: 'Victim key' });
    expect(key.status).toBe(201);
    const keyId = key.body.apiKey.id as string;

    // Attacker aims the revoke at their OWN :id but the VICTIM's :keyId.
    const attack = await request(app).delete(`/api/v1/users/${attacker.id}/api-keys/${keyId}`).set(auth(attackerToken));
    expect(attack.status).toBe(404);

    // Confirm the key is still live.
    const list = await request(app).get(`/api/v1/users/${victim.id}/api-keys`).set(auth(victimToken));
    expect(list.body.apiKeys.find((k: { id: string }) => k.id === keyId).revokedAt).toBeNull();
  });

  it('does let a user revoke their own API key via their own :id', async () => {
    const owner = await createUser('idor-owner@example.com');
    const ownerToken = await loginAs(owner.email);
    const key = await request(app).post(`/api/v1/users/${owner.id}/api-keys`).set(auth(ownerToken)).send({ label: 'Own key' });
    const keyId = key.body.apiKey.id as string;

    const res = await request(app).delete(`/api/v1/users/${owner.id}/api-keys/${keyId}`).set(auth(ownerToken));
    expect(res.status).toBe(204);

    const list = await request(app).get(`/api/v1/users/${owner.id}/api-keys`).set(auth(ownerToken));
    expect(list.body.apiKeys.find((k: { id: string }) => k.id === keyId).revokedAt).not.toBeNull();
  });
});
