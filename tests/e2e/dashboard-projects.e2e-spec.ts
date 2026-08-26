import { Test } from '@nestjs/testing';
import { SessionStatus, WhatsappAccountMode } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WahaClient } from '../../src/waha/waha.client';
import { configureDashboardTestApp } from '../helpers/dashboard-app';
import { cookiePairsFromResponse, signedCookiePair } from '../helpers/signed-cookie';

describe('Dashboard project/account/token flows (e2e)', () => {
  let app: NestExpressApplication;
  let authCookies: string;
  const csrf = 'csrf-dashboard-e2e';
  const secret = process.env.COOKIE_SECRET ?? '';

  const admin = {
    id: 'admin1',
    email: 'admin@example.com',
    isActive: true,
    sessionVersion: 1,
  };

  const projects = new Map<string, Record<string, unknown>>();
  const accounts = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, Record<string, unknown>>();

  const matches = (row: Record<string, unknown>, where?: Record<string, unknown>): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, value]) => row[key] === value);
  };

  const prismaMock = {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    admin: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.id === admin.id || where.email === admin.email || where.singleton === 1
          ? admin
          : null,
      ),
    },
    project: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `proj_${String(data.slug)}`,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        projects.set(String(row.id), row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        projects.get(where.id) ?? null,
      ),
      findMany: jest.fn(async () =>
        [...projects.values()].map((project) => ({
          ...project,
          _count: {
            apiTokens: [...tokens.values()].filter((row) => row.projectId === project.id).length,
            whatsappAccounts: [...accounts.values()].filter((row) => row.projectId === project.id)
              .length,
          },
        })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = projects.get(where.id);
        if (!current) return null;
        const next = { ...current, ...data, updatedAt: new Date() };
        projects.set(where.id, next);
        return next;
      }),
      count: jest.fn(async () => projects.size),
    },
    whatsappAccount: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `acc_${String(data.label).trim().toLowerCase().replace(/\s+/g, '_')}`,
          phoneNumber: null,
          status: SessionStatus.QR_REQUIRED,
          isActive: true,
          lastConnectedAt: null,
          lastDisconnectedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        accounts.set(String(row.id), row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        [...accounts.values()].filter((row) => matches(row, where)),
      ),
      findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        [...accounts.values()].find((row) => matches(row, where)) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = accounts.get(where.id);
        if (!current) return null;
        const next = { ...current, ...data, updatedAt: new Date() };
        accounts.set(where.id, next);
        return next;
      }),
    },
    apiToken: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `tok_${tokens.size + 1}`,
          lastUsedAt: null,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tokens.set(String(row.id), row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        [...tokens.values()].filter((row) => matches(row, where)),
      ),
      findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        [...tokens.values()].find((row) => matches(row, where)) ?? null,
      ),
      update: jest.fn(),
    },
    outboundMessageLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(WahaClient)
      .useValue({
        healthCheck: jest.fn().mockResolvedValue(true),
        startSession: jest.fn(),
        stopSession: jest.fn(),
        restartSession: jest.fn(),
        getStatus: jest.fn().mockRejectedValue(new Error('offline')),
        getQr: jest.fn(),
        sendText: jest.fn(),
        sendImageByUrl: jest.fn(),
        sendVideoByUrl: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureDashboardTestApp(app);
    await app.init();
    const now = new Date();
    projects.set('proj_acme', {
      id: 'proj_acme',
      name: 'Acme',
      slug: 'acme',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    projects.set('proj_beta', {
      id: 'proj_beta',
      name: 'Beta',
      slug: 'beta',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const jwt = app.get(JwtService).sign({ sub: admin.id, sv: admin.sessionVersion });
    authCookies = [signedCookiePair('gw_session', jwt, secret), `gw_csrf=${csrf}`].join('; ');
  });

  afterAll(async () => {
    await app.close();
  });

  const formPost = (path: string, fields: Record<string, string>, cookies = authCookies) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', cookies)
      .type('form')
      .send({ _csrf: csrf, ...fields })
      .redirects(0);

  const htmlGet = (path: string, cookies = authCookies) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookies).set('Accept', 'text/html');

  it('creates, lists, and updates a project', async () => {
    const created = await formPost('/projects', { name: 'Acme', slug: 'acme' });
    expect(created.status).toBe(303);
    expect(created.headers.location).toBe('/projects/proj_acme');

    const list = await htmlGet('/projects');
    expect(list.status).toBe(200);
    expect(list.text).toContain('Acme');

    const updated = await formPost('/projects/proj_acme/update', { name: 'Acme App', slug: 'acme' });
    expect(updated.status).toBe(303);
    const detail = await htmlGet('/projects/proj_acme');
    expect(detail.text).toContain('Acme App');
  });

  it('rejects mutating POSTs without a matching CSRF token', async () => {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .set('Cookie', authCookies)
      .set('Accept', 'application/json')
      .type('form')
      .send({ name: 'No CSRF', slug: 'nocsrf' })
      .redirects(0);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('creates an account, warns when two are active, then deactivates one', async () => {
    await formPost('/projects', { name: 'Beta', slug: 'beta' });
    const newPage = await htmlGet('/projects/proj_beta/accounts/new');
    expect(newPage.text).toContain('MESSENGER enables NOWEB Store and v1 chats/history APIs');

    const first = await formPost('/projects/proj_beta/accounts', {
      label: 'Primary',
      mode: WhatsappAccountMode.SEND_ONLY,
    });
    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/projects/proj_beta/accounts/acc_primary');

    await formPost('/projects/proj_beta/accounts', {
      label: 'Secondary',
      mode: WhatsappAccountMode.MESSENGER,
    });
    const ambiguous = await htmlGet('/projects/proj_beta');
    expect(ambiguous.text).toContain('PROJECT_ACCOUNT_AMBIGUOUS');

    const deactivated = await formPost('/projects/proj_beta/accounts/acc_secondary/deactivate', {});
    expect(deactivated.status).toBe(303);
    const resolved = await htmlGet('/projects/proj_beta');
    expect(resolved.text).not.toContain('PROJECT_ACCOUNT_AMBIGUOUS');

    const reactivated = await formPost('/projects/proj_beta/accounts/acc_secondary/activate', {});
    expect(reactivated.status).toBe(303);

    const cross = await request(app.getHttpServer())
      .post('/projects/proj_acme/accounts/acc_primary/deactivate')
      .set('Cookie', authCookies)
      .set('Accept', 'application/json')
      .type('form')
      .send({ _csrf: csrf })
      .redirects(0);
    expect(cross.status).toBe(404);
  });

  it('reveals a new token once on the issuing project and never on another project', async () => {
    const created = await formPost('/projects/proj_acme/tokens', { name: 'prod' });
    expect(created.status).toBe(303);
    expect(created.headers.location).toBe('/projects/proj_acme');
    expect(String(created.headers.location)).not.toContain('revealed');
    const reveal = cookiePairsFromResponse(created.headers, ['gw_token_reveal']);
    expect(reveal).toContain('gw_token_reveal=');

    const withReveal = `${authCookies}; ${reveal}`;
    const other = await htmlGet('/projects/proj_beta', withReveal);
    expect(other.status).toBe(200);
    expect(other.text).not.toContain('Save this token now');
    expect(other.text).not.toMatch(/gw_test_[A-Za-z0-9_-]+/);
    expect(cookiePairsFromResponse(other.headers, ['gw_token_reveal'])).toBe('');

    const first = await htmlGet('/projects/proj_acme', withReveal);
    expect(first.text).toContain('Save this token now');
    expect(first.text).toMatch(/gw_test_[A-Za-z0-9_-]+/);
    const rawMatch = first.text.match(/gw_test_[A-Za-z0-9_-]+/);
    const raw = rawMatch?.[0] ?? '';
    expect(raw.length).toBeGreaterThan(10);

    const second = await htmlGet(
      '/projects/proj_acme',
      `${authCookies}; ${cookiePairsFromResponse(first.headers, ['gw_token_reveal'])}`,
    );
    expect(second.text).not.toContain('Save this token now');
    expect(second.text).not.toContain(raw);
  });
});
