import axios from 'axios';
import { WebhookDeliveryStatus } from '@prisma/client';
import { ProjectWebhookDeliveryService } from '../../src/webhooks/project-webhook-delivery.service';

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('../../src/common/utils/public-url', () => ({
  validatePublicHttpsUrl: jest.fn(async (raw: string) => ({
    href: raw,
    hostname: new URL(raw).hostname,
  })),
  InvalidPublicUrlError: class InvalidPublicUrlError extends Error {},
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProjectWebhookDeliveryService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'WEBHOOK_MAX_ATTEMPTS') return 3;
      if (key === 'WEBHOOK_RETRY_BASE_MS') return 100;
      if (key === 'WEBHOOK_DELIVERY_TIMEOUT_MS') return 5_000;
      throw new Error(`unexpected ${key}`);
    }),
  };

  const payload = {
    eventId: 'evt_dup',
    accountId: 'acc_1',
    type: 'message.received' as const,
    timestamp: '2026-08-26T09:00:00.000Z',
    data: { messageId: 'm1', chatId: '37499111222@c.us', body: 'Hi', bodyTruncated: false },
  };

  const build = () => {
    const deliveries: Array<Record<string, unknown>> = [];
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({
          webhookEnabled: true,
          webhookUrl: 'https://hooks.example.com/inbound',
          webhookSecretHash: 'abc123signingkey',
          isActive: true,
        }),
      },
      projectWebhookDelivery: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (
            deliveries.some(
              (row) => row.projectId === data.projectId && row.eventId === data.eventId,
            )
          ) {
            throw new Error('unique');
          }
          const row = {
            id: `d${deliveries.length + 1}`,
            attemptCount: 0,
            ...data,
          };
          deliveries.push(row);
          return row;
        }),
        findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const dueBefore =
            typeof where.nextAttemptAt === 'object' &&
            where.nextAttemptAt !== null &&
            'lte' in where.nextAttemptAt
              ? (where.nextAttemptAt as { lte: Date }).lte
              : new Date();
          return deliveries
            .filter(
              (row) =>
                row.status === where.status &&
                (row.nextAttemptAt === null ||
                  row.nextAttemptAt === undefined ||
                  (row.nextAttemptAt as Date) <= dueBefore),
            )
            .map((row) => ({ id: row.id }));
        }),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const row = deliveries.find((item) => item.id === where.id);
          if (!row) return null;
          return {
            ...row,
            project: {
              webhookEnabled: true,
              webhookUrl: 'https://hooks.example.com/inbound',
              webhookSecretHash: 'abc123signingkey',
              isActive: true,
            },
          };
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const idx = deliveries.findIndex((row) => row.id === where.id);
            deliveries[idx] = { ...deliveries[idx], ...data };
            return deliveries[idx];
          },
        ),
        groupBy: jest.fn(),
      },
    };
    const service = new ProjectWebhookDeliveryService(prisma as never, config as never);
    return { service, prisma, deliveries };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  it('does not POST twice for duplicate eventId', async () => {
    const { service } = build();
    await service.enqueueDelivery('p1', 'acc_1', payload, 'req_1');
    await service.enqueueDelivery('p1', 'acc_1', payload, 'req_2');
    await service.processDueDeliveriesForTests();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('uses maxRedirects 0 on every POST', async () => {
    const { service } = build();
    await service.enqueueDelivery('p1', 'acc_1', { ...payload, eventId: 'evt_redirect' }, 'req_1');
    await service.processDueDeliveriesForTests();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ maxRedirects: 0 }),
    );
  });

  it('marks blocked webhook URLs as FAILED without POST', async () => {
    const { validatePublicHttpsUrl, InvalidPublicUrlError } = jest.requireMock(
      '../../src/common/utils/public-url',
    ) as {
      validatePublicHttpsUrl: jest.Mock;
      InvalidPublicUrlError: new (message: string) => Error;
    };
    validatePublicHttpsUrl.mockRejectedValueOnce(new InvalidPublicUrlError('blocked'));
    const { service, prisma } = build();
    await service.enqueueDelivery('p1', 'acc_1', { ...payload, eventId: 'evt_ssrf' }, 'req_1');
    await service.processDueDeliveriesForTests();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(prisma.projectWebhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WebhookDeliveryStatus.FAILED,
          lastErrorCode: 'SSRF_BLOCKED',
        }),
      }),
    );
  });
});
