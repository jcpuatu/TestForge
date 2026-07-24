const statusEnum = ['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST'];
const priorityEnum = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const roleEnum = ['ADMIN', 'LEAD', 'TESTER', 'VIEWER'];
const typeEnum = ['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'];
const templateEnum = ['TEXT', 'STEPS', 'EXPLORATORY', 'BDD'];
const webhookEventEnum = ['RUN_COMPLETED', 'RUN_CREATED', 'CASE_CREATED'];

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
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  DirectoryUser: {
    type: 'object',
    description: 'Minimal active-user info, visible to any authenticated user (used to populate assignee pickers).',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', enum: roleEnum },
    },
  },
  ApiKey: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      label: { type: 'string' },
      keyPrefix: { type: 'string' },
      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
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
      description: { type: 'string', nullable: true },
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
      template: { type: 'string', enum: templateEnum },
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
      mission: { type: 'string', nullable: true, description: 'EXPLORATORY template only' },
      goals: { type: 'string', nullable: true, description: 'EXPLORATORY template only' },
      bddLines: {
        type: 'array',
        nullable: true,
        description: 'BDD template only',
        items: { type: 'object', properties: { keyword: { type: 'string' }, text: { type: 'string' } } },
      },
      priority: { type: 'string', enum: priorityEnum },
      type: { type: 'string', enum: typeEnum },
      estimate: { type: 'string', nullable: true, description: 'Free-text, e.g. "10s", "2m", "1h"' },
      referenceLink: { type: 'string', nullable: true },
      isDeleted: { type: 'boolean' },
      orderIndex: { type: 'integer' },
      createdById: { type: 'string', nullable: true },
      labels: { type: 'array', items: { $ref: '#/components/schemas/Label' } },
      sharedSteps: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      },
    },
  },
  TestRun: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      suiteId: { type: 'string', nullable: true },
      planId: { type: 'string', nullable: true },
      milestoneId: { type: 'string', nullable: true },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      configLabel: { type: 'string', nullable: true },
      startDate: { type: 'string', format: 'date-time', nullable: true },
      endDate: { type: 'string', format: 'date-time', nullable: true },
      includeAll: { type: 'boolean' },
      isCompleted: { type: 'boolean' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  RunCase: {
    type: 'object',
    description: "A case's execution within a specific run (TestRail calls this a \"Test\"), exposed at /tests/{id} for API parity with TestRail's own surface.",
    properties: {
      id: { type: 'string' },
      runId: { type: 'string' },
      caseId: { type: 'string', nullable: true },
      titleSnapshot: { type: 'string' },
      templateSnapshot: { type: 'string', enum: templateEnum },
      status: { type: 'string', enum: statusEnum },
      priority: { type: 'string', enum: priorityEnum },
      assignedToId: { type: 'string', nullable: true },
      orderIndex: { type: 'integer' },
    },
  },
  Result: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      runCaseId: { type: 'string' },
      status: { type: 'string', enum: statusEnum },
      comment: { type: 'string', nullable: true },
      defects: { type: 'string', nullable: true, description: 'Comma-separated defect IDs/URLs, free text' },
      version: { type: 'string', nullable: true },
      elapsedMs: { type: 'integer', nullable: true },
      stepResults: {
        type: 'array',
        nullable: true,
        items: { type: 'object', properties: { status: { type: 'string', enum: statusEnum }, actual: { type: 'string' } } },
      },
      enteredById: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Milestone: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      parentId: { type: 'string', nullable: true },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      startDate: { type: 'string', format: 'date-time', nullable: true },
      dueDate: { type: 'string', format: 'date-time', nullable: true },
      references: { type: 'string', nullable: true },
      isCompleted: { type: 'boolean' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  TestPlan: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      milestoneId: { type: 'string', nullable: true },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      startDate: { type: 'string', format: 'date-time', nullable: true },
      endDate: { type: 'string', format: 'date-time', nullable: true },
      referenceId: { type: 'string', nullable: true },
      isCompleted: { type: 'boolean' },
      completedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  Label: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      name: { type: 'string' },
    },
  },
  SharedStepSet: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      steps: {
        type: 'array',
        items: { type: 'object', properties: { step: { type: 'string' }, expected: { type: 'string' } } },
      },
      caseCount: { type: 'integer', description: 'Number of cases currently attaching this set' },
    },
  },
  ConfigGroup: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      name: { type: 'string' },
      configs: { type: 'array', items: { $ref: '#/components/schemas/Config' } },
    },
  },
  Config: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      configGroupId: { type: 'string' },
      name: { type: 'string' },
    },
  },
  Webhook: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string', nullable: true },
      url: { type: 'string' },
      event: { type: 'string', enum: webhookEventEnum },
      isActive: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  WebhookDelivery: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      webhookId: { type: 'string' },
      statusCode: { type: 'integer', nullable: true },
      success: { type: 'boolean' },
      requestBody: { type: 'string' },
      responseBody: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  AuditLogEntry: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      projectId: { type: 'string' },
      actorId: { type: 'string', nullable: true },
      actor: { type: 'object', nullable: true, properties: { id: { type: 'string' }, name: { type: 'string' } } },
      action: { type: 'string' },
      entityType: { type: 'string' },
      entityId: { type: 'string' },
      summary: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Attachment: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      filename: { type: 'string' },
      mimeType: { type: 'string' },
      size: { type: 'integer' },
      caseId: { type: 'string', nullable: true },
      resultId: { type: 'string', nullable: true },
      uploadedById: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  DeleteImpact: {
    type: 'object',
    description: 'Shape varies per resource — always a set of counts describing what a delete would destroy or unlink, for a confirmation UI to show before committing.',
  },
};

function idParam(name = 'id') {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

function crud(resource: string, tag: string, schema: string) {
  return {
    [`/${resource}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Get a ${tag.toLowerCase()} by id`,
        parameters: [idParam()],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      patch: {
        tags: [tag],
        summary: `Update a ${tag.toLowerCase()}`,
        parameters: [idParam()],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' }, 403: { description: 'Forbidden' } },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${tag.toLowerCase()}`,
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' }, 403: { description: 'Forbidden' } },
      },
    },
  };
}

// The GET .../{id}/delete-impact preview pattern (Projects/Suites/Sections/Milestones/Runs/
// SharedStepSets all expose one before their own DELETE, so a confirmation UI can show real
// counts of what would be destroyed/unlinked). See root CLAUDE.md's "Delete-impact preview
// pattern" convention.
function deleteImpact(resource: string, tag: string, idName = 'id') {
  return {
    [`/${resource}/{${idName}}/delete-impact`]: {
      get: {
        tags: [tag],
        summary: `Preview what deleting this ${tag.toLowerCase()} would destroy/unlink`,
        parameters: [idParam(idName)],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteImpact' } } } },
          404: { description: 'Not found' },
        },
      },
    },
  };
}

// The common "GET list / POST create" shape for a resource nested under a parent path
// (/parents/{parentIdName}/resource) — most of this API's list-scoped resources follow it.
function listCreate(
  path: string,
  tag: string,
  parentIdName: string,
  schema: string,
  opts: { createSummary?: string; requestBody?: unknown } = {},
) {
  return {
    [path]: {
      get: {
        tags: [tag],
        summary: `List ${tag.toLowerCase()}`,
        parameters: [idParam(parentIdName)],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${schema}` } } } },
          },
        },
      },
      post: {
        tags: [tag],
        summary: opts.createSummary ?? `Create a ${tag.toLowerCase().replace(/s$/, '')}`,
        parameters: [idParam(parentIdName)],
        requestBody: opts.requestBody ? { required: true, content: { 'application/json': { schema: opts.requestBody } } } : undefined,
        responses: { 201: { description: 'Created' }, 403: { description: 'Forbidden' } },
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
      'REST API for TestForge, a TestRail-style test case management tool. Authenticate with either a JWT access token (from /auth/login) or a long-lived API key (from /users/{id}/api-keys), both sent as `Authorization: Bearer <token>`. Rate-limited: 300 req/15min globally, 10 req/15min on /auth/login.',
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
    // ── Auth ────────────────────────────────────────────────────────────
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
          429: { description: 'Too many login attempts (rate limited)' },
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

    // ── Users & API keys (ADMIN-provisioned — no public self-registration) ─
    '/users/directory': {
      get: {
        tags: ['Users'],
        summary: 'List active users (id/name/role only) — open to any authenticated user, for populating assignee pickers',
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DirectoryUser' } } } },
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List all users, full detail (ADMIN only)',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user (ADMIN only) — there is no public self-registration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email: { type: 'string' },
                  name: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: roleEnum, default: 'TESTER' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 400: { description: 'Duplicate email (case-insensitive)' } },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: "Get a user by id — self, or ADMIN for anyone",
        parameters: [idParam()],
        responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update a user (ADMIN only) — blocked if it would leave zero active admins',
        parameters: [idParam()],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string', enum: roleEnum },
                  isActive: { type: 'boolean' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Would remove the last remaining admin' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Deactivate a user (ADMIN only, soft-delete via isActive=false — there is no hard-delete). Blocked if it would leave zero active admins.',
        parameters: [idParam()],
        responses: { 204: { description: 'Deactivated' }, 400: { description: 'Would remove the last remaining admin' } },
      },
    },
    '/users/{id}/api-keys': {
      get: {
        tags: ['Users'],
        summary: 'List a user\'s API keys (raw key never included) — self, or ADMIN',
        parameters: [idParam()],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } } } } },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Issue a new API key for a user — self, or ADMIN. Raw key is returned once and never retrievable again.',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' } } },
            },
          },
        },
        responses: { 201: { description: 'Created — response includes the one-time raw key' } },
      },
    },
    '/users/{id}/api-keys/{keyId}': {
      delete: {
        tags: ['Users'],
        summary: 'Revoke an API key — self, or ADMIN. Scoped to keys actually owned by {id}.',
        parameters: [idParam(), idParam('keyId')],
        responses: { 204: { description: 'Revoked' }, 404: { description: 'Not found or not owned by this user' } },
      },
    },

    // ── Projects ────────────────────────────────────────────────────────
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects (unfiltered — roles are global, not per-project, so every user sees every project)',
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object', properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } } },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project (ADMIN/LEAD only)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'Created' }, 403: { description: 'Forbidden' } },
      },
    },
    ...crud('projects', 'Projects', 'Project'),
    ...deleteImpact('projects', 'Projects'),

    // ── Suites ──────────────────────────────────────────────────────────
    '/projects/{projectId}/suites': {
      get: {
        tags: ['Suites'],
        summary: 'List suites in a project',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Suites'],
        summary: 'Create a suite (ADMIN/LEAD only)',
        parameters: [idParam('projectId')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    ...crud('suites', 'Suites', 'Suite'),
    ...deleteImpact('suites', 'Suites'),

    // ── Sections ────────────────────────────────────────────────────────
    '/suites/{suiteId}/sections': {
      get: {
        tags: ['Sections'],
        summary: 'List sections in a suite (flat; nest via parentId)',
        parameters: [idParam('suiteId')],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Sections'],
        summary: 'Create a section (ADMIN/LEAD only)',
        parameters: [idParam('suiteId')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, parentId: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/sections/{id}': crud('sections', 'Sections', 'Section')['/sections/{id}'],
    ...deleteImpact('sections', 'Sections'),
    '/sections/{id}/move': {
      post: {
        tags: ['Sections'],
        summary: 'Reorder and/or reparent a section (ADMIN/LEAD only) — rejects a move that would create a cycle',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['parentId', 'orderIndex'],
                properties: { parentId: { type: 'string', nullable: true }, orderIndex: { type: 'integer', minimum: 0 } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Full re-normalized section list for the suite (both the destination and origin sibling groups)' },
          400: { description: 'Would create a cycle' },
        },
      },
    },

    // ── Cases ───────────────────────────────────────────────────────────
    '/suites/{suiteId}/cases': {
      get: {
        tags: ['Cases'],
        summary: 'Flat, filterable list of all cases in a suite (sectionIds/priorities/types/createdByIds/labelIds/createdAfter/createdBefore/match=all|any/sortBy/sortDir)',
        parameters: [idParam('suiteId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/suites/{suiteId}/cases/export': {
      get: {
        tags: ['Cases'],
        summary: 'Export cases as CSV (optional sectionIds/columns query params — title is always force-included)',
        parameters: [idParam('suiteId')],
        responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/suites/{suiteId}/cases/import': {
      post: {
        tags: ['Cases'],
        summary: 'Import cases from CSV (ADMIN/LEAD/TESTER). "Sections Hierarchy" column (Parent > Child) auto-creates sections.',
        parameters: [idParam('suiteId')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['csv'], properties: { csv: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { imported: { type: 'integer' } } } } } }, 400: { description: 'Malformed CSV, or a row failed validation (blank title, over-length field, etc.)' } },
      },
    },
    '/suites/{suiteId}/cases/export-feature': {
      get: {
        tags: ['Cases'],
        summary: 'Export every BDD-template case in a suite as one .feature file',
        parameters: [idParam('suiteId')],
        responses: { 200: { description: '.feature file', content: { 'text/plain': { schema: { type: 'string' } } } } },
      },
    },
    '/suites/{suiteId}/cases/import-feature': {
      post: {
        tags: ['Cases'],
        summary: 'Import a .feature file as BDD-template cases (ADMIN/LEAD/TESTER) — auto-creates a section named after the Feature line',
        parameters: [idParam('suiteId')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['featureText'], properties: { featureText: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { imported: { type: 'integer' }, sectionName: { type: 'string' } } } } } } },
      },
    },
    '/sections/{sectionId}/cases': {
      get: {
        tags: ['Cases'],
        summary: 'List cases in a section (supports ?deleted=true to view the soft-deleted set)',
        parameters: [idParam('sectionId')],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Cases'],
        summary: 'Create a case (ADMIN/LEAD/TESTER)',
        parameters: [idParam('sectionId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', maxLength: 300 },
                  template: { type: 'string', enum: templateEnum, default: 'TEXT' },
                  preconditions: { type: 'string' },
                  steps: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, expected: { type: 'string' } } } },
                  expectedResult: { type: 'string' },
                  mission: { type: 'string' },
                  goals: { type: 'string' },
                  bddLines: { type: 'array', items: { type: 'object', properties: { keyword: { type: 'string' }, text: { type: 'string' } } } },
                  priority: { type: 'string', enum: priorityEnum, default: 'MEDIUM' },
                  type: { type: 'string', enum: typeEnum, default: 'FUNCTIONAL' },
                  estimate: { type: 'string' },
                  referenceLink: { type: 'string' },
                  labelIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
                  sharedStepSetIds: { type: 'array', items: { type: 'string' }, maxItems: 20 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    ...crud('cases', 'Cases', 'TestCase'),
    '/cases/{id}/history': {
      get: {
        tags: ['Cases'],
        summary: 'Every run this case has appeared in with its latest status there, plus a defect rollup scoped to this case',
        parameters: [idParam()],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/cases/{id}/restore': {
      post: {
        tags: ['Cases'],
        summary: 'Restore a soft-deleted case (ADMIN/LEAD)',
        parameters: [idParam()],
        responses: { 200: { description: 'Restored' } },
      },
    },
    '/cases/{id}/permanent': {
      delete: {
        tags: ['Cases'],
        summary: 'Permanently delete an already-soft-deleted case (ADMIN/LEAD) — immediate, irreversible',
        parameters: [idParam()],
        responses: { 204: { description: 'Permanently deleted' }, 400: { description: 'Case must be soft-deleted first' } },
      },
    },
    '/cases/bulk-update': {
      patch: {
        tags: ['Cases'],
        summary: 'Bulk-edit priority/type/sectionId across many cases at once (ADMIN/LEAD/TESTER) — only fields actually set are changed',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['caseIds'],
                properties: {
                  caseIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 },
                  priority: { type: 'string', enum: priorityEnum },
                  type: { type: 'string', enum: typeEnum },
                  sectionId: { type: 'string', description: 'Must belong to the same suite as every case being moved' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { updated: { type: 'integer' } } } } } }, 400: { description: 'Cross-suite sectionId, or no fields provided' } },
      },
    },
    '/cases/bulk-delete': {
      post: {
        tags: ['Cases'],
        summary: 'Bulk soft-delete cases (ADMIN/LEAD)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['caseIds'], properties: { caseIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 } } } } },
        },
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'integer' } } } } } } },
      },
    },
    '/cases/bulk-restore': {
      post: {
        tags: ['Cases'],
        summary: 'Bulk-restore soft-deleted cases (ADMIN/LEAD)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['caseIds'], properties: { caseIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 } } } } },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/cases/bulk-add-labels': {
      post: {
        tags: ['Cases'],
        summary: 'Additively apply labels to many cases at once (ADMIN/LEAD/TESTER) — adds to each case\'s existing labels, does not replace them',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['caseIds', 'labelIds'],
                properties: {
                  caseIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 },
                  labelIds: { type: 'array', items: { type: 'string' }, maxItems: 10 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/cases/{id}/promote-shared-steps': {
      post: {
        tags: ['Cases'],
        summary: 'Turn a case\'s current literal steps into a new reusable SharedStepSet, additively attaching it (ADMIN/LEAD/TESTER)',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 120 } } } } },
        },
        responses: { 201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { sharedStepSet: { $ref: '#/components/schemas/SharedStepSet' } } } } } }, 400: { description: 'Case has no steps to promote' } },
      },
    },

    // ── Runs ────────────────────────────────────────────────────────────
    '/projects/{projectId}/runs': {
      get: {
        tags: ['Runs'],
        summary: 'List runs in a project, each with a per-run status breakdown',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Runs'],
        summary: 'Create a run (ADMIN/LEAD). Snapshots all (or selected) cases from a suite into the run — this snapshot is immutable history from this point on.',
        parameters: [idParam('projectId')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'suiteId'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  suiteId: { type: 'string' },
                  planId: { type: 'string' },
                  milestoneId: { type: 'string', description: 'Must belong to the same project' },
                  configLabel: { type: 'string' },
                  startDate: { type: 'string', format: 'date-time' },
                  endDate: { type: 'string', format: 'date-time' },
                  caseIds: { type: 'array', items: { type: 'string' }, description: 'Omit to include every case in the suite' },
                  assignedToId: { type: 'string', description: 'Assigns every test in the run to this user at creation' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 400: { description: 'No matching cases to include' }, 404: { description: 'Suite/milestone not found or not in this project' } },
      },
    },
    '/runs/{id}': {
      get: {
        tags: ['Runs'],
        summary: 'Get a run, including its plan/milestone (and, if reached only via a plan, the plan\'s own milestone) for date-inheritance resolution',
        parameters: [idParam()],
        responses: { 200: { description: 'OK' } },
      },
      patch: {
        tags: ['Runs'],
        summary: 'Update a run\'s name/description/dates, or bulk-reassign every test in it via assignedToId (ADMIN/LEAD). Blocked on a completed run.',
        parameters: [idParam()],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  startDate: { type: 'string', format: 'date-time', nullable: true },
                  endDate: { type: 'string', format: 'date-time', nullable: true },
                  assignedToId: { type: 'string', nullable: true, description: 'Bulk-reassigns every RunCase in the run, distinct from the TestRun row itself' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Run is completed' } },
      },
      delete: {
        tags: ['Runs'],
        summary: 'Permanently delete a run and its results (ADMIN/LEAD). No UI path calls this — Reopen/Rerun are the documented ways back from a closed run.',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    ...deleteImpact('runs', 'Runs'),
    '/runs/{id}/close': {
      post: {
        tags: ['Runs'],
        summary: 'Close a run (ADMIN/LEAD) — fires a RUN_COMPLETED webhook. Real TestRail treats this as permanent; Reopen/Rerun are this app\'s own documented escape hatches.',
        parameters: [idParam()],
        responses: { 200: { description: 'Closed' } },
      },
    },
    '/runs/{id}/reopen': {
      post: {
        tags: ['Runs'],
        summary: 'Reopen a completed run (ADMIN/LEAD) — a deliberate deviation from real TestRail, which has no equivalent',
        parameters: [idParam()],
        responses: { 200: { description: 'Reopened' } },
      },
    },
    '/runs/{id}/rerun': {
      post: {
        tags: ['Runs'],
        summary: 'Create a new run containing only the tests matching the given statuses, cloning their immutable snapshots as-of the ORIGINAL run (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['statuses'],
                properties: {
                  statuses: { type: 'array', items: { type: 'string', enum: statusEnum } },
                  copyAssignees: { type: 'boolean', default: false },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 400: { description: 'No tests match the selected statuses' } },
      },
    },
    '/runs/{id}/tests': {
      get: {
        tags: ['Runs'],
        summary: 'List the tests (run cases) in a run, each with its assignee and latest result',
        parameters: [idParam()],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tests: { type: 'array', items: { $ref: '#/components/schemas/RunCase' } } } } } } },
        },
      },
    },
    '/runs/{id}/tests/bulk-assign': {
      post: {
        tags: ['Runs'],
        summary: 'Bulk-reassign a selected subset of tests within a run (ADMIN/LEAD/TESTER). Blocked on a completed run.',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['testIds', 'assignedToId'],
                properties: { testIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 }, assignedToId: { type: 'string', nullable: true } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 400: { description: 'Run is completed' } },
      },
    },
    '/runs/{id}/tests/bulk-result': {
      post: {
        tags: ['Runs'],
        summary: 'Submit the same status to many tests at once within a run (ADMIN/LEAD/TESTER). No stepResults/defects — for identical batch outcomes only. Blocked on a completed run.',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['testIds', 'status'],
                properties: {
                  testIds: { type: 'array', items: { type: 'string' }, maxItems: 5000 },
                  status: { type: 'string', enum: statusEnum },
                  comment: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 400: { description: 'Run is completed' } },
      },
    },
    '/runs/{id}/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Pass/fail/blocked/retest/untested counts for a run',
        parameters: [idParam()],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/runs/{id}/defects/export': {
      get: {
        tags: ['Runs'],
        summary: 'Export every FAILED/BLOCKED test in a run as a Jira-bulk-import-shaped CSV, using each test\'s latest result',
        parameters: [idParam()],
        responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },

    // ── Results / Tests ─────────────────────────────────────────────────
    '/tests/{id}': {
      get: {
        tags: ['Results'],
        summary: 'Get a test (RunCase) by id',
        parameters: [idParam()],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/RunCase' } } } } },
      },
      patch: {
        tags: ['Results'],
        summary: 'Reassign a single test (ADMIN/LEAD/TESTER). Blocked on a completed run.',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['assignedToId'], properties: { assignedToId: { type: 'string', nullable: true } } } } },
        },
        responses: { 200: { description: 'Reassigned' }, 400: { description: 'Run is completed' } },
      },
    },
    '/tests/{id}/results': {
      get: {
        tags: ['Results'],
        summary: 'Get the result history for a test, newest first',
        parameters: [idParam()],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { $ref: '#/components/schemas/Result' } } } } } },
          },
        },
      },
      post: {
        tags: ['Results'],
        summary: "Submit a result for a test (ADMIN/LEAD/TESTER). Updates the test's denormalized current status in the same transaction. Blocked on a completed run.",
        parameters: [idParam()],
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
                  version: { type: 'string' },
                  elapsedMs: { type: 'integer', maximum: 86400000, description: '24h ceiling' },
                  stepResults: {
                    type: 'array',
                    description: 'Positionally matches the test\'s stepsSnapshot',
                    items: { type: 'object', properties: { status: { type: 'string', enum: statusEnum }, actual: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Result recorded' }, 400: { description: 'Run is completed' } },
      },
    },

    // ── Milestones ──────────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/milestones', 'Milestones', 'projectId', 'Milestone', {
      requestBody: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          dueDate: { type: 'string', format: 'date-time' },
          references: { type: 'string' },
          parentId: { type: 'string', description: 'Must belong to the same project' },
        },
      },
    }),
    ...crud('milestones', 'Milestones', 'Milestone'),
    ...deleteImpact('milestones', 'Milestones'),

    // ── Plans ───────────────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/plans', 'Plans', 'projectId', 'TestPlan', {
      createSummary: 'Create a test plan (ADMIN/LEAD)',
      requestBody: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          milestoneId: { type: 'string', description: 'Must belong to the same project' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          referenceId: { type: 'string' },
        },
      },
    }),
    '/plans/{planId}/runs': {
      post: {
        tags: ['Plans'],
        summary: 'Add a run to a plan (ADMIN/LEAD)',
        parameters: [idParam('planId')],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/plans/{planId}/runs/by-config': {
      post: {
        tags: ['Plans'],
        summary: 'Create one run per selected configuration value under a plan (ADMIN/LEAD) — not a cross-group combination matrix',
        parameters: [idParam('planId')],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name', 'suiteId', 'configIds'], properties: { name: { type: 'string' }, suiteId: { type: 'string' }, caseIds: { type: 'array', items: { type: 'string' } }, configIds: { type: 'array', items: { type: 'string' } }, assignedToId: { type: 'string' } } } } },
        },
        responses: { 201: { description: 'OK — response includes `runs` created and `failed` (per-config errors, if any)' } },
      },
    },
    '/plans/{id}': crud('plans', 'Plans', 'TestPlan')['/plans/{id}'],
    '/plans/{id}/rerun': {
      post: {
        tags: ['Plans'],
        summary: 'Rerun every run in a plan independently with the same status filter, attaching the new runs to the same plan (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['statuses'],
                properties: { statuses: { type: 'array', items: { type: 'string', enum: statusEnum } }, copyAssignees: { type: 'boolean', default: false } },
              },
            },
          },
        },
        responses: { 201: { description: 'OK — response includes `runs` created, `skipped` (no matching tests), and `failed` (unexpected per-run errors, if any)' } },
      },
    },

    // ── Dashboard & Defects ─────────────────────────────────────────────
    '/projects/{projectId}/dashboard': {
      get: {
        tags: ['Reports'],
        summary: 'Project-level stats: suite/case/run/milestone/plan counts, recent-run list, active-run pass rate',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Reports'],
        summary: 'Cross-project dashboard — per-project stats and active-run status breakdowns, aggregated project totals',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/defects': {
      get: {
        tags: ['Reports'],
        summary: 'Project-wide defect rollup, derived on the fly from each test\'s latest result (there is no stored Defect entity)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },

    // ── Cases Reports ───────────────────────────────────────────────────
    '/projects/{projectId}/reports/cases/activity-summary': {
      get: {
        tags: ['Reports'],
        summary: 'Cases created/updated in a date range, grouped by Day/Month/Section (query: preset|from|to, groupBy, includeNew)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/cases/coverage-for-references': {
      get: {
        tags: ['Reports'],
        summary: '% of cases with a referenceLink set, grouped by reference ID (query: referenceIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/cases/property-distribution': {
      get: {
        tags: ['Reports'],
        summary: 'Cases grouped by Priority/Type/Template/Created By (query: groupBy)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/cases/status-tops': {
      get: {
        tags: ['Reports'],
        summary: 'Cases grouped by latest (or all) RunCase.status across selected runs (query: runIds — defaults to the 25 most recent runs)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },

    // ── Defects Reports ─────────────────────────────────────────────────
    '/projects/{projectId}/reports/defects/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Defect ID rollup (count/open/resolved) scoped to selected runs (query: runIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/defects/summary-for-cases': {
      get: {
        tags: ['Reports'],
        summary: 'Cases x runs matrix with defect IDs per cell, only cases with a defect somewhere in scope (query: runIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/defects/summary-for-references': {
      get: {
        tags: ['Reports'],
        summary: 'Summary for Cases, grouped by parsed reference ID (query: runIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },

    // ── Results Reports ─────────────────────────────────────────────────
    '/projects/{projectId}/reports/results/comparison-for-cases': {
      get: {
        tags: ['Reports'],
        summary: 'Cases x runs matrix, pure status per cell (query: runIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/results/comparison-for-references': {
      get: {
        tags: ['Reports'],
        summary: 'Comparison for Cases, grouped by parsed reference ID (query: runIds)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/results/property-distribution': {
      get: {
        tags: ['Reports'],
        summary: 'Tests grouped by Status/Type/Assigned To/Template across selected runs (query: runIds, groupBy)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },

    // ── Summary Reports (Milestone/Plan/Project/Runs share one aggregation core) ─
    '/milestones/{milestoneId}/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Summary report scoped to a milestone (its own runs, runs reached via a tied plan, and the same across its full child-milestone subtree)',
        parameters: [idParam('milestoneId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/plans/{planId}/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Summary report scoped to a plan\'s own runs',
        parameters: [idParam('planId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/summary': {
      get: {
        tags: ['Reports'],
        summary: 'Summary report scoped to every run in the project directly (TestRun.projectId), independent of milestones',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/projects/{projectId}/reports/runs-summary': {
      get: {
        tags: ['Reports'],
        summary: 'Summary report scoped to an explicit list of runs (query: runIds — no selection means an intentionally empty report, unlike every other run-scoped report here)',
        parameters: [idParam('projectId')],
        responses: { 200: { description: 'OK' } },
      },
    },

    // ── Webhooks ────────────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/webhooks', 'Webhooks', 'projectId', 'Webhook', {
      createSummary: 'Register a webhook (ADMIN/LEAD). Target URL is rejected if it resolves to a loopback/private/link-local address.',
      requestBody: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string', format: 'uri' }, event: { type: 'string', enum: webhookEventEnum, default: 'RUN_COMPLETED' } },
      },
    }),
    '/webhooks/{id}': {
      patch: {
        tags: ['Webhooks'],
        summary: 'Update a webhook\'s url/event/isActive (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, event: { type: 'string', enum: webhookEventEnum }, isActive: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Webhooks'],
        summary: 'Delete a webhook (ADMIN/LEAD)',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    '/webhooks/{id}/test': {
      post: {
        tags: ['Webhooks'],
        summary: 'Send a test ping to exactly this webhook (ADMIN/LEAD) — does not fan out to other webhooks sharing the same project+event',
        parameters: [idParam()],
        responses: { 202: { description: 'Dispatched' } },
      },
    },
    '/webhooks/{id}/deliveries': {
      get: {
        tags: ['Webhooks'],
        summary: 'Last 25 delivery attempts for a webhook (ADMIN/LEAD)',
        parameters: [idParam()],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { deliveries: { type: 'array', items: { $ref: '#/components/schemas/WebhookDelivery' } } } } } } },
        },
      },
    },

    // ── Labels ──────────────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/labels', 'Labels', 'projectId', 'Label', {
      createSummary: 'Create a label (ADMIN/LEAD) — name must be case-insensitively unique in the project',
      requestBody: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
    }),
    '/labels/{id}': {
      patch: {
        tags: ['Labels'],
        summary: 'Rename a label (ADMIN/LEAD) — propagates everywhere automatically, every assignment points at the same id',
        parameters: [idParam()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: { 200: { description: 'Renamed' } },
      },
      delete: {
        tags: ['Labels'],
        summary: 'Delete a label (ADMIN/LEAD) — cascades off every case that had it',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    // ── Shared Steps ────────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/shared-step-sets', 'Shared Steps', 'projectId', 'SharedStepSet', {
      createSummary: 'Create a shared step set (ADMIN/LEAD)',
      requestBody: {
        type: 'object',
        required: ['name', 'steps'],
        properties: { name: { type: 'string', maxLength: 120 }, steps: { type: 'array', minItems: 1, items: { type: 'object', properties: { step: { type: 'string' }, expected: { type: 'string' } } } } },
      },
    }),
    '/shared-step-sets/{id}': {
      patch: {
        tags: ['Shared Steps'],
        summary: 'Rename and/or replace the steps of a shared set (ADMIN/LEAD) — live-linked, every attached case picks up the change immediately (except already-created run snapshots, which are frozen)',
        parameters: [idParam()],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, expected: { type: 'string' } } } } } } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Shared Steps'],
        summary: 'Delete a shared step set (ADMIN/LEAD) — attached cases keep their own literal steps but lose this shared block',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    ...deleteImpact('shared-step-sets', 'Shared Steps'),

    // ── Configurations ──────────────────────────────────────────────────
    ...listCreate('/projects/{projectId}/config-groups', 'Configurations', 'projectId', 'ConfigGroup', {
      createSummary: 'Create a configuration group, optionally seeding initial values in the same call (ADMIN/LEAD)',
      requestBody: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, configs: { type: 'array', items: { type: 'string' }, description: 'Seed initial config values' } },
      },
    }),
    '/config-groups/{id}': {
      patch: {
        tags: ['Configurations'],
        summary: 'Rename a configuration group (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: { 200: { description: 'Renamed' } },
      },
      delete: {
        tags: ['Configurations'],
        summary: 'Delete a configuration group (ADMIN/LEAD) — cascades its configs; runs already created from them keep a plain-string configLabel snapshot, unaffected',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },
    '/config-groups/{id}/configs': {
      post: {
        tags: ['Configurations'],
        summary: 'Add a config value to a group (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/configs/{id}': {
      patch: {
        tags: ['Configurations'],
        summary: 'Rename a config value (ADMIN/LEAD)',
        parameters: [idParam()],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } },
        responses: { 200: { description: 'Renamed' } },
      },
      delete: {
        tags: ['Configurations'],
        summary: 'Delete a config value (ADMIN/LEAD)',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    // ── Audit log ───────────────────────────────────────────────────────
    '/projects/{projectId}/audit-log': {
      get: {
        tags: ['Audit'],
        summary: 'Last 200 audit entries for a project (label/section/suite/case delete, milestone/plan/run date changes, run close/reopen/delete)',
        parameters: [idParam('projectId')],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { entries: { type: 'array', items: { $ref: '#/components/schemas/AuditLogEntry' } } } } } } },
        },
      },
    },

    // ── Attachments ─────────────────────────────────────────────────────
    '/cases/{caseId}/attachments': {
      get: {
        tags: ['Attachments'],
        summary: 'List attachments on a case',
        parameters: [idParam('caseId')],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { attachments: { type: 'array', items: { $ref: '#/components/schemas/Attachment' } } } } } } },
        },
      },
      post: {
        tags: ['Attachments'],
        summary: 'Upload an attachment to a case (ADMIN/LEAD/TESTER) — multipart/form-data, field name "file", 10MB cap',
        parameters: [idParam('caseId')],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 201: { description: 'Created' }, 413: { description: 'File exceeds the 10MB cap' } },
      },
    },
    '/results/{resultId}/attachments': {
      get: {
        tags: ['Attachments'],
        summary: 'List attachments on a result',
        parameters: [idParam('resultId')],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { attachments: { type: 'array', items: { $ref: '#/components/schemas/Attachment' } } } } } } },
        },
      },
      post: {
        tags: ['Attachments'],
        summary: 'Upload an attachment to a result (ADMIN/LEAD/TESTER) — multipart/form-data, field name "file", 10MB cap',
        parameters: [idParam('resultId')],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 201: { description: 'Created' }, 413: { description: 'File exceeds the 10MB cap' } },
      },
    },
    '/attachments/{id}': {
      get: {
        tags: ['Attachments'],
        summary: 'Download an attachment — always forces Content-Disposition: attachment (never rendered inline), regardless of content type',
        parameters: [idParam()],
        responses: { 200: { description: 'File contents' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Attachments'],
        summary: 'Delete an attachment (ADMIN/LEAD/TESTER)',
        parameters: [idParam()],
        responses: { 204: { description: 'Deleted' } },
      },
    },

    // ── Me ──────────────────────────────────────────────────────────────
    '/me/tests': {
      get: {
        tags: ['Me'],
        summary: 'Tests assigned to the caller in still-open runs, split Active/Upcoming (query: ?userId= to view another user\'s list — ADMIN/LEAD only, silently ignored for anyone else)',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tests: { type: 'array', items: { $ref: '#/components/schemas/RunCase' } } } } } } },
        },
      },
    },
    '/me/workload': {
      get: {
        tags: ['Me'],
        summary: 'Bar of active-run test counts per assignee, across all projects (ADMIN/LEAD only)',
        responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden for TESTER/VIEWER' } },
      },
    },
  },
  tags: [
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Projects' },
    { name: 'Suites' },
    { name: 'Sections' },
    { name: 'Cases' },
    { name: 'Runs' },
    { name: 'Results' },
    { name: 'Milestones' },
    { name: 'Plans' },
    { name: 'Reports' },
    { name: 'Webhooks' },
    { name: 'Labels' },
    { name: 'Shared Steps' },
    { name: 'Configurations' },
    { name: 'Audit' },
    { name: 'Attachments' },
    { name: 'Me' },
  ],
};
