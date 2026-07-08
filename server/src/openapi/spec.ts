const statusEnum = ['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST'];
const priorityEnum = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const roleEnum = ['ADMIN', 'LEAD', 'TESTER', 'VIEWER'];

const schemas = {
  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
  User: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', enum: roleEnum },
      isActive: { type: 'boolean' },
    },
  },
  Project: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      isCompleted: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Suite: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
    },
  },
  Section: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      suiteId: { type: 'string' },
      parentId: { type: 'string', nullable: true },
      name: { type: 'string' },
      orderIndex: { type: 'integer' },
    },
  },
  TestCase: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      suiteId: { type: 'string' },
      sectionId: { type: 'string', nullable: true },
      title: { type: 'string' },
      preconditions: { type: 'string', nullable: true },
      steps: {
        type: 'array',
        nullable: true,
        items: {
          type: 'object',
          properties: { step: { type: 'string' }, expected: { type: 'string' } },
        },
      },
      expectedResult: { type: 'string', nullable: true },
      priority: { type: 'string', enum: priorityEnum },
      type: { type: 'string' },
    },
  },
  TestRun: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      suiteId: { type: 'string', nullable: true },
      planId: { type: 'string', nullable: true },
      name: { type: 'string' },
      isCompleted: { type: 'boolean' },
    },
  },
  RunCase: {
    type: 'object',
    description: "A case's execution within a specific run (TestRail calls this a \"Test\").",
    properties: {
      id: { type: 'string' },
      runId: { type: 'string' },
      titleSnapshot: { type: 'string' },
      status: { type: 'string', enum: statusEnum },
      priority: { type: 'string', enum: priorityEnum },
    },
  },
  Result: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: statusEnum },
      comment: { type: 'string', nullable: true },
      defects: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Milestone: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      dueDate: { type: 'string', format: 'date-time', nullable: true },
      isCompleted: { type: 'boolean' },
    },
  },
  TestPlan: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      milestoneId: { type: 'string', nullable: true },
      name: { type: 'string' },
      isCompleted: { type: 'boolean' },
    },
  },
};

function crud(resource: string, tag: string, schema: string) {
  return {
    [`/${resource}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Get a ${tag.toLowerCase()} by id`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: [tag],
        summary: `Update a ${tag.toLowerCase()}`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${tag.toLowerCase()}`,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Deleted' }, 403: { description: 'Forbidden' } },
      },
    },
  };
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TestForge API',
    version: '1.0.0',
    description:
      'REST API for TestForge, a TestRail-style test case management tool. Authenticate with either a JWT access token (from /auth/login) or a long-lived API key (from /users/{id}/api-keys), both sent as `Authorization: Bearer <token>`.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT or API key (tf_...)',
      },
    },
    schemas,
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Access token issued; refresh token set as an httpOnly cookie',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { accessToken: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token and issue a new access token',
        security: [],
        responses: { 200: { description: 'New access token issued' }, 401: { description: 'Invalid/expired/reused refresh token' } },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke the current refresh token', security: [], responses: { 204: { description: 'Logged out' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current authenticated user',
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthenticated' } },
      },
    },
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects',
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project (ADMIN/LEAD only)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' }, 403: { description: 'Forbidden' } },
      },
    },
    ...crud('projects', 'Projects', 'Project'),
    '/projects/{projectId}/suites': {
      get: {
        tags: ['Suites'],
        summary: 'List suites in a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Suites'],
        summary: 'Create a suite (ADMIN/LEAD only)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    ...crud('suites', 'Suites', 'Suite'),
    '/suites/{suiteId}/sections': {
      get: {
        tags: ['Sections'],
        summary: 'List sections in a suite (flat; nest via parentId)',
        parameters: [{ name: 'suiteId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Sections'],
        summary: 'Create a section (ADMIN/LEAD only)',
        parameters: [{ name: 'suiteId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/sections/{id}': crud('sections', 'Sections', 'Section')['/sections/{id}'],
    '/suites/{suiteId}/cases': {
      get: {
        tags: ['Cases'],
        summary: 'List all cases in a suite (filterable by sectionId/priority/type)',
        parameters: [{ name: 'suiteId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/sections/{sectionId}/cases': {
      get: {
        tags: ['Cases'],
        summary: 'List cases in a section',
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Cases'],
        summary: 'Create a case (ADMIN/LEAD/TESTER)',
        parameters: [{ name: 'sectionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    ...crud('cases', 'Cases', 'TestCase'),
    '/projects/{projectId}/runs': {
      get: {
        tags: ['Runs'],
        summary: 'List runs in a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Runs'],
        summary: 'Create a run (ADMIN/LEAD). Snapshots all (or selected) cases from a suite into the run.',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'suiteId'],
                properties: {
                  name: { type: 'string' },
                  suiteId: { type: 'string' },
                  caseIds: { type: 'array', items: { type: 'string' }, description: 'Omit to include every case in the suite' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 400: { description: 'No matching cases to include' } },
      },
    },
    '/runs/{id}': {
      get: {
        tags: ['Runs'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/runs/{id}/close': {
      post: {
        tags: ['Runs'],
        summary: 'Close a run (ADMIN/LEAD)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Closed' } },
      },
    },
    '/runs/{id}/tests': {
      get: {
        tags: ['Runs'],
        summary: 'List the tests (run cases) in a run',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/RunCase' } } } },
          },
        },
      },
    },
    '/runs/{id}/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Pass/fail/blocked/retest/untested counts for a run',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/tests/{id}/results': {
      get: {
        tags: ['Results'],
        summary: 'Get the result history for a test',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Result' } } } },
          },
        },
      },
      post: {
        tags: ['Results'],
        summary: 'Submit a result for a test (ADMIN/LEAD/TESTER). Updates the test’s current status.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: statusEnum },
                  comment: { type: 'string' },
                  defects: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Result recorded' } },
      },
    },
    '/projects/{projectId}/milestones': {
      get: {
        tags: ['Milestones'],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Milestones'],
        summary: 'Create a milestone (ADMIN/LEAD)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    ...crud('milestones', 'Milestones', 'Milestone'),
    '/projects/{projectId}/plans': {
      get: {
        tags: ['Plans'],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Plans'],
        summary: 'Create a test plan (ADMIN/LEAD)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/plans/{planId}/runs': {
      post: {
        tags: ['Plans'],
        summary: 'Add a run to a plan (ADMIN/LEAD)',
        parameters: [{ name: 'planId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/plans/{id}': crud('plans', 'Plans', 'TestPlan')['/plans/{id}'],
    '/projects/{projectId}/dashboard': {
      get: {
        tags: ['Reports'],
        summary: 'Project-level stats: suite/case/run/milestone counts, recent-run pass rate, per-run breakdowns',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/users': {
      get: { tags: ['Users'], summary: 'List users (ADMIN only)', responses: { 200: { description: 'OK' } } },
      post: {
        tags: ['Users'],
        summary: 'Create a user (ADMIN only) — there is no public self-registration',
        responses: { 201: { description: 'Created' } },
      },
    },
    '/users/{id}/api-keys': {
      post: {
        tags: ['Users'],
        summary: 'Issue a new API key for a user (raw key returned once)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
  },
  tags: [
    { name: 'Auth' },
    { name: 'Projects' },
    { name: 'Suites' },
    { name: 'Sections' },
    { name: 'Cases' },
    { name: 'Runs' },
    { name: 'Results' },
    { name: 'Milestones' },
    { name: 'Plans' },
    { name: 'Reports' },
    { name: 'Users' },
  ],
};
