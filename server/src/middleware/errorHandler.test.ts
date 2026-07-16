import request from 'supertest';
import { app } from '../app';
import { prisma } from '../config/prisma-client';
import { hashPassword } from '../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'errhandler-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;
});

describe('errorHandler', () => {
  it('surfaces an oversized request body as a clear 413, not a generic 500', async () => {
    const project = await request(app)
      .post('/api/v1/projects')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ name: 'ErrHandler Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ name: 'Suite' });

    // express.json() is configured with a 10mb limit — a body past that should surface as a
    // clear PAYLOAD_TOO_LARGE error, not the generic INTERNAL_ERROR fallback (the actual bug:
    // a real-world CSV import exceeding the *old* 100kb default was masquerading as an
    // unexplained "Something went wrong").
    const oversized = 'x'.repeat(11 * 1024 * 1024);
    const res = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/cases/import`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ csv: oversized });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
