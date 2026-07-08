import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUser(email: string, name: string, role: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, name, role, passwordHash } });
  console.log(`Seeded ${role} user: ${email} / ${password}`);
  return user;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@testforge.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const admin = await seedUser(adminEmail, 'Admin', 'ADMIN', adminPassword);
  const lead = await seedUser('lead@testforge.local', 'Lena Lead', 'LEAD', 'LeadPass123!');
  const tester = await seedUser('tester@testforge.local', 'Tom Tester', 'TESTER', 'TesterPass123!');
  await seedUser('viewer@testforge.local', 'Vera Viewer', 'VIEWER', 'ViewerPass123!');

  const existingProject = await prisma.project.findFirst({ where: { name: 'Online Banking' } });
  if (existingProject) {
    console.log('Demo project "Online Banking" already exists, skipping demo data seed.');
    return;
  }

  const project = await prisma.project.create({
    data: { name: 'Online Banking', description: 'Core banking regression suite for the demo bank app.' },
  });

  const transfersSuite = await prisma.suite.create({
    data: { projectId: project.id, name: 'Fund Transfers', description: 'Internal and external transfer flows.' },
  });
  const internalSection = await prisma.section.create({
    data: { suiteId: transfersSuite.id, name: 'Internal Transfers' },
  });
  const externalSection = await prisma.section.create({
    data: { suiteId: transfersSuite.id, name: 'External Transfers' },
  });

  const billsSuite = await prisma.suite.create({
    data: { projectId: project.id, name: 'Bill Payment', description: 'Payee management and payment scheduling.' },
  });
  const payeeSection = await prisma.section.create({ data: { suiteId: billsSuite.id, name: 'Payee Management' } });
  const schedulingSection = await prisma.section.create({ data: { suiteId: billsSuite.id, name: 'Payment Scheduling' } });

  const caseData = [
    {
      section: internalSection,
      suite: transfersSuite,
      title: 'Transfer between own accounts succeeds',
      priority: 'HIGH',
      type: 'FUNCTIONAL',
      steps: [
        { step: 'Select source and destination account', expected: 'Both accounts listed' },
        { step: 'Enter a valid amount and submit', expected: 'Transfer confirmation shown' },
      ],
      expectedResult: 'Balances update immediately on both accounts.',
    },
    {
      section: internalSection,
      suite: transfersSuite,
      title: 'Transfer with insufficient funds shows error',
      priority: 'HIGH',
      type: 'FUNCTIONAL',
      steps: [{ step: 'Enter amount greater than available balance', expected: 'Insufficient funds error shown' }],
      expectedResult: 'Transfer is blocked; no balance change.',
    },
    {
      section: externalSection,
      suite: transfersSuite,
      title: 'Transfer to external bank requires routing number',
      priority: 'MEDIUM',
      type: 'FUNCTIONAL',
      steps: [{ step: 'Submit external transfer without routing number', expected: 'Validation error shown' }],
      expectedResult: 'Form cannot be submitted without a routing number.',
    },
    {
      section: payeeSection,
      suite: billsSuite,
      title: 'Add new payee succeeds',
      priority: 'MEDIUM',
      type: 'FUNCTIONAL',
      steps: [{ step: 'Fill payee details and save', expected: 'Payee appears in payee list' }],
      expectedResult: null,
    },
    {
      section: schedulingSection,
      suite: billsSuite,
      title: 'Schedule recurring payment succeeds',
      priority: 'LOW',
      type: 'REGRESSION',
      steps: [{ step: 'Set up a monthly recurring payment', expected: 'Confirmation with next run date shown' }],
      expectedResult: null,
    },
  ] as const;

  const createdCases = [];
  for (const c of caseData) {
    const testCase = await prisma.testCase.create({
      data: {
        suiteId: c.suite.id,
        sectionId: c.section.id,
        title: c.title,
        priority: c.priority,
        type: c.type,
        steps: JSON.stringify(c.steps),
        expectedResult: c.expectedResult,
        createdById: lead.id,
      },
    });
    createdCases.push(testCase);
  }

  const milestone = await prisma.milestone.create({
    data: {
      projectId: project.id,
      name: 'Release 2.0',
      description: 'Next quarterly release.',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const plan = await prisma.testPlan.create({
    data: { projectId: project.id, milestoneId: milestone.id, name: 'Release 2.0 Regression Plan', createdById: lead.id },
  });

  const transferCases = createdCases.filter((c) => c.suiteId === transfersSuite.id);
  const smokeRun = await prisma.testRun.create({
    data: { projectId: project.id, suiteId: transfersSuite.id, planId: plan.id, name: 'Smoke Run — Fund Transfers', createdById: lead.id },
  });
  for (const [index, c] of transferCases.entries()) {
    await prisma.runCase.create({
      data: {
        runId: smokeRun.id,
        caseId: c.id,
        titleSnapshot: c.title,
        stepsSnapshot: c.steps,
        expectedSnapshot: c.expectedResult,
        priority: c.priority,
        orderIndex: index,
      },
    });
  }

  const runCases = await prisma.runCase.findMany({ where: { runId: smokeRun.id } });
  await prisma.result.create({
    data: { runCaseId: runCases[0].id, status: 'PASSED', comment: 'Verified end to end.', enteredById: tester.id },
  });
  await prisma.runCase.update({ where: { id: runCases[0].id }, data: { status: 'PASSED', assignedToId: tester.id } });

  if (runCases[1]) {
    await prisma.result.create({
      data: { runCaseId: runCases[1].id, status: 'FAILED', comment: 'Error message not shown.', defects: 'BUG-101', enteredById: tester.id },
    });
    await prisma.runCase.update({ where: { id: runCases[1].id }, data: { status: 'FAILED', assignedToId: tester.id } });
  }

  console.log(`Seeded demo project "Online Banking" (admin=${admin.email}) with 2 suites, ${createdCases.length} cases, 1 milestone, 1 plan, 1 run.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
