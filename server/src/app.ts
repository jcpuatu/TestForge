import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi/spec';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/routes';
import { usersRouter } from './modules/users/routes';
import { projectsRouter } from './modules/projects/routes';
import { suitesRouter, suitesNestedRouter } from './modules/suites/routes';
import { sectionsRouter, sectionsNestedRouter } from './modules/sections/routes';
import { casesRouter, casesBySuiteRouter, casesBySectionRouter } from './modules/cases/routes';
import { runsRouter, runsNestedRouter, runsByPlanRouter } from './modules/runs/routes';
import { testsRouter } from './modules/results/routes';
import { milestonesRouter, milestonesNestedRouter } from './modules/milestones/routes';
import { plansRouter, plansNestedRouter } from './modules/plans/routes';
import { dashboardRouter, defectsRouter } from './modules/reports/routes';
import { webhooksRouter, webhooksNestedRouter } from './modules/webhooks/routes';
import { meRouter } from './modules/me/routes';

export const app = express();

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/v1/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/projects/:projectId/suites', suitesNestedRouter);
app.use('/api/v1/projects/:projectId/runs', runsNestedRouter);
app.use('/api/v1/projects/:projectId/milestones', milestonesNestedRouter);
app.use('/api/v1/projects/:projectId/plans', plansNestedRouter);
app.use('/api/v1/projects/:projectId/dashboard', dashboardRouter);
app.use('/api/v1/projects/:projectId/defects', defectsRouter);
app.use('/api/v1/projects/:projectId/webhooks', webhooksNestedRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/suites/:suiteId/sections', sectionsNestedRouter);
app.use('/api/v1/suites/:suiteId/cases', casesBySuiteRouter);
app.use('/api/v1/suites', suitesRouter);
app.use('/api/v1/sections/:sectionId/cases', casesBySectionRouter);
app.use('/api/v1/sections', sectionsRouter);
app.use('/api/v1/cases', casesRouter);
app.use('/api/v1/plans/:planId/runs', runsByPlanRouter);
app.use('/api/v1/plans', plansRouter);
app.use('/api/v1/milestones', milestonesRouter);
app.use('/api/v1/webhooks', webhooksRouter);
app.use('/api/v1/runs', runsRouter);
app.use('/api/v1/tests', testsRouter);
app.use('/api/v1/me', meRouter);

app.use(errorHandler);
