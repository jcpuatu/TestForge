import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

// Each `it` below needs to start from "exactly one active admin" regardless of what earlier
// tests in this file left behind (a *rejected* PATCH/DELETE leaves its admin still active), so
// every solo-admin test calls this first rather than relying on file-level setup/ordering.
async function deactivateAllAdmins() {
  await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { isActive: false } });
}

async function createAdmin(email: string) {
  const user = await prisma.user.create({
    data: { email, name: email, role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'AdminPass123!' });
  return { id: user.id, token: login.body.accessToken as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Regression tests: PATCH/DELETE on the last remaining active admin previously succeeded
// unconditionally, which could leave a project with zero admins and no way to provision users,
// promote anyone, or manage RBAC -- an unrecoverable lockout short of direct DB access.
describe('last-admin lockout', () => {
  it('rejects demoting the only active admin via PATCH role change', async () => {
    await deactivateAllAdmins();
    const solo = await createAdmin('lockout-solo-role@example.com');

    const res = await request(app).patch(`/api/v1/users/${solo.id}`).set(auth(solo.token)).send({ role: 'TESTER' });

    expect(res.status).toBe(400);
    const reloaded = await prisma.user.findUnique({ where: { id: solo.id } });
    expect(reloaded?.role).toBe('ADMIN');
  });

  it('rejects deactivating the only active admin via PATCH isActive', async () => {
    await deactivateAllAdmins();
    const solo = await createAdmin('lockout-solo-active@example.com');

    const res = await request(app).patch(`/api/v1/users/${solo.id}`).set(auth(solo.token)).send({ isActive: false });

    expect(res.status).toBe(400);
    const reloaded = await prisma.user.findUnique({ where: { id: solo.id } });
    expect(reloaded?.isActive).toBe(true);
  });

  it('rejects deactivating the only active admin via DELETE', async () => {
    await deactivateAllAdmins();
    const solo = await createAdmin('lockout-solo-delete@example.com');

    const res = await request(app).delete(`/api/v1/users/${solo.id}`).set(auth(solo.token));

    expect(res.status).toBe(400);
    const reloaded = await prisma.user.findUnique({ where: { id: solo.id } });
    expect(reloaded?.isActive).toBe(true);
  });

  it('allows demoting an admin when another active admin exists', async () => {
    await deactivateAllAdmins();
    const first = await createAdmin('lockout-pair-role-1@example.com');
    const second = await createAdmin('lockout-pair-role-2@example.com');

    const res = await request(app).patch(`/api/v1/users/${first.id}`).set(auth(second.token)).send({ role: 'TESTER' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('TESTER');
  });

  it('allows deactivating an admin when another active admin exists', async () => {
    await deactivateAllAdmins();
    const first = await createAdmin('lockout-pair-delete-1@example.com');
    const second = await createAdmin('lockout-pair-delete-2@example.com');

    const res = await request(app).delete(`/api/v1/users/${first.id}`).set(auth(second.token));

    expect(res.status).toBe(204);
    const reloaded = await prisma.user.findUnique({ where: { id: first.id } });
    expect(reloaded?.isActive).toBe(false);
  });

  it('does not trip the guard for an edit that leaves admin status untouched, even with only one admin', async () => {
    await deactivateAllAdmins();
    const solo = await createAdmin('lockout-solo-noop@example.com');

    const res = await request(app).patch(`/api/v1/users/${solo.id}`).set(auth(solo.token)).send({ name: 'Renamed Solo' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Renamed Solo');
  });
});
