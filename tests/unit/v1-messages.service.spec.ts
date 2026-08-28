import { SessionStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { V1MessagesService } from '../../src/v1/v1-messages.service';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
import { hashV1SendRequest } from '../../src/v1/request-hash';

const project = { apiTokenId: 't1', projectId: 'p1' };
const textInput = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello' };

const buildConfig = (overrides: Record<string, number> = {}) => ({
  get: jest.fn((key: string) => {
    if (key in overrides) return overrides[key];
    if (key === 'MAX_TEXT_LENGTH') return 4096;
    if (key === 'IDEMPOTENCY_PROCESSING_TIMEOUT_MS') return 120_000;
    if (key === 'MAX_CAPTION_LENGTH') return 4096;
    if (key === 'MAX_IMAGE_SIZE_MB') return 10;
    if (key === 'MAX_VIDEO_SIZE_MB') return 50;
    return undefined;
  }),
});

const connected = (
  id: string,
  sessionName: string,
  status: SessionStatus = SessionStatus.CONNECTED,
) => ({
  id,
  sessionName,
  isActive: true,
  status,
  label: id,
  mode: 'SEND_ONLY',
  phoneNumber: '37499111222',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const prismaForFresh = (account: ReturnType<typeof connected>) => {
  const prisma = {
    $transaction: jest.fn(),
    whatsappAccount: {
      findFirst: jest.fn().mockResolvedValue(account),
    },
    outboundMessageIdempotency: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: `idemp_${data.whatsappAccountId}`,
        ...data,
        updatedAt: new Date(),
      })),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outboundMessageLog: {
      create: jest.fn().mockResolvedValue({ id: 'log1', requestId: 'req_log1' }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return prisma;
};

describe('V1MessagesService', () => {
  it('sends Account A and Account B through different WAHA session names', async () => {
    const prismaA = prismaForFresh(connected('acc-a', 'wa_aaa'));
    const prismaB = prismaForFresh(connected('acc-b', 'wa_bbb'));
    const wahaClient = { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) };
    const serviceA = new V1MessagesService(
      prismaA as never,
      wahaClient as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    const serviceB = new V1MessagesService(
      prismaB as never,
      wahaClient as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await serviceA.send(project, 'acc-a', textInput, 'idem-key-aaaa');
    await serviceB.send(project, 'acc-b', textInput, 'idem-key-bbbb');
    expect(wahaClient.sendText).toHaveBeenNthCalledWith(
      1,
      'wa_aaa',
      textInput.chatId,
      textInput.text,
    );
    expect(wahaClient.sendText).toHaveBeenNthCalledWith(
      2,
      'wa_bbb',
      textInput.chatId,
      textInput.text,
    );
  });

  it('does not store text, caption, mediaUrl, raw token, or WAHA error text', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    const service = new V1MessagesService(
      prisma as never,
      { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await service.send(project, 'acc1', textInput, 'idem-key-cccc');
    const logData = prisma.outboundMessageLog.create.mock.calls[0]?.[0].data as Record<
      string,
      unknown
    >;
    expect(logData).not.toHaveProperty('text');
    expect(logData).not.toHaveProperty('caption');
    expect(logData).not.toHaveProperty('mediaUrl');
    expect(logData).not.toHaveProperty('token');
    expect(logData.requestHash).toBe(hashV1SendRequest(textInput));
  });

  it('replays SUCCEEDED without WAHA even when the account is now disconnected', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess', SessionStatus.DISCONNECTED));
    prisma.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc1',
      idempotencyKey: 'idem-key-replay',
      requestHash: hashV1SendRequest(textInput),
      status: 'SUCCEEDED',
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const sendText = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendText } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    const result = await service.send(project, 'acc1', textInput, 'idem-key-replay');
    expect(result.messageId).toBe('w_old');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('does not send twice for concurrent identical keys', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageIdempotency.findUnique.mockImplementation(
      async ({
        where,
      }: {
        where: { whatsappAccountId_idempotencyKey: { idempotencyKey: string } };
      }) => {
        const key = where.whatsappAccountId_idempotencyKey.idempotencyKey;
        return rows.get(key) ?? null;
      },
    );
    prisma.outboundMessageIdempotency.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const key = String(data.idempotencyKey);
        if (rows.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        const row = { id: 'idemp1', ...data, updatedAt: new Date() };
        rows.set(key, row);
        return row;
      },
    );
    let release!: (value: { id: string }) => void;
    const gate = new Promise<{ id: string }>((resolve) => {
      release = resolve;
    });
    const sendText = jest.fn().mockImplementation(() => gate);
    const service = new V1MessagesService(
      prisma as never,
      { sendText } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    const first = service.send(project, 'acc1', textInput, 'idem-key-dddd');
    await new Promise((resolve) => setImmediate(resolve));
    const second = service.send(project, 'acc1', textInput, 'idem-key-dddd');
    release({ id: 'w1' });
    const results = await Promise.allSettled([first, second]);
    expect(sendText).toHaveBeenCalledTimes(1);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS,
    });
  });

  it('marks transport and HTTP 502 after dispatch as OUTCOME_UNKNOWN', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    const service = new V1MessagesService(
      prisma as never,
      { sendText: jest.fn().mockRejectedValue(new WahaTransportError('timeout')) } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await expect(service.send(project, 'acc1', textInput, 'idem-key-eeee')).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
    const http = prismaForFresh(connected('acc1', 'wa_sess'));
    const httpService = new V1MessagesService(
      http as never,
      {
        sendText: jest.fn().mockRejectedValue(new WahaApiError('upstream body', 502)),
      } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await expect(
      httpService.send(project, 'acc1', textInput, 'idem-key-ffff'),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
    const idemUpdates = http.outboundMessageIdempotency.updateMany.mock.calls.map(
      (call) => call[0].data as Record<string, unknown>,
    );
    expect(idemUpdates.some((row) => row.status === 'OUTCOME_UNKNOWN')).toBe(true);
    expect(JSON.stringify(http.outboundMessageIdempotency.updateMany.mock.calls)).not.toContain(
      'upstream body',
    );
    const failedLogWrites = http.outboundMessageLog.updateMany.mock.calls.filter(
      (call) => (call[0] as { data?: { status?: string } }).data?.status === 'FAILED',
    );
    expect(failedLogWrites).toHaveLength(0);
  });

  it('treats persistence failure after WAHA success as OUTCOME_UNKNOWN, not FAILED', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageLog.updateMany.mockRejectedValueOnce(new Error('db down'));
    const service = new V1MessagesService(
      prisma as never,
      { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await expect(service.send(project, 'acc1', textInput, 'idem-key-gggg')).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
    const failedWrites = prisma.outboundMessageLog.updateMany.mock.calls.filter(
      (call) => (call[0] as { data?: { status?: string } }).data?.status === 'FAILED',
    );
    expect(failedWrites).toHaveLength(0);
  });

  it('replays SUCCEEDED when MAX_TEXT_LENGTH is now smaller than the original text', async () => {
    const longText = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello world' };
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc1',
      idempotencyKey: 'idem-key-text-limit',
      requestHash: hashV1SendRequest(longText),
      status: 'SUCCEEDED',
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const config = buildConfig({ MAX_TEXT_LENGTH: 3 });
    const sendText = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendText } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      config as never,
    );
    const result = await service.send(project, 'acc1', longText, 'idem-key-text-limit');
    expect(result.messageId).toBe('w_old');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('enforces MAX_TEXT_LENGTH only for a fresh send', async () => {
    const longText = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello world' };
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    const config = buildConfig({ MAX_TEXT_LENGTH: 3 });
    const sendText = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendText } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      config as never,
    );
    await expect(
      service.send(project, 'acc1', longText, 'idem-key-fresh-limit'),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('replays SUCCEEDED when MAX_CAPTION_LENGTH is now smaller', async () => {
    const imageInput = {
      type: 'IMAGE' as const,
      chatId: '37499111222@c.us',
      mediaUrl: 'https://cdn.example.com/a.jpg',
      caption: 'a stored caption',
    };
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc1',
      idempotencyKey: 'idem-key-caption-limit',
      requestHash: hashV1SendRequest(imageInput),
      status: 'SUCCEEDED',
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const config = buildConfig({ MAX_CAPTION_LENGTH: 3 });
    const sendImageByUrl = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendImageByUrl } as never,
      {
        effectiveSessionName: (a: { sessionName: string }) => a.sessionName,
        sendImageByUrl,
      } as never,
      config as never,
    );
    const result = await service.send(project, 'acc1', imageInput, 'idem-key-caption-limit');
    expect(result.messageId).toBe('w_old');
    expect(sendImageByUrl).not.toHaveBeenCalled();
  });

  it('replays SUCCEEDED when the original media URL is now unavailable', async () => {
    const imageInput = {
      type: 'IMAGE' as const,
      chatId: '37499111222@c.us',
      mediaUrl: 'http://127.0.0.1/missing.jpg',
    };
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc1',
      idempotencyKey: 'idem-key-media-gone',
      requestHash: hashV1SendRequest(imageInput),
      status: 'SUCCEEDED',
      requestId: 'req_old',
      messageId: 'w_old',
      sentAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedAt: new Date(),
    });
    const sendImageByUrl = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendImageByUrl } as never,
      {
        effectiveSessionName: (a: { sessionName: string }) => a.sessionName,
        sendImageByUrl,
      } as never,
      buildConfig() as never,
    );
    const result = await service.send(project, 'acc1', imageInput, 'idem-key-media-gone');
    expect(result.messageId).toBe('w_old');
    expect(sendImageByUrl).not.toHaveBeenCalled();
  });

  it('replays FAILED with the stored error code and never calls WAHA', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    prisma.outboundMessageIdempotency.findUnique.mockResolvedValue({
      id: 'idemp1',
      whatsappAccountId: 'acc1',
      idempotencyKey: 'idem-key-failed',
      requestHash: hashV1SendRequest(textInput),
      status: 'FAILED',
      errorCode: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
      updatedAt: new Date(),
    });
    const sendText = jest.fn();
    const service = new V1MessagesService(
      prisma as never,
      { sendText } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await expect(service.send(project, 'acc1', textInput, 'idem-key-failed')).rejects.toMatchObject(
      {
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
      },
    );
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns OUTCOME_UNKNOWN when the post-WAHA transaction rolls back', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    let txCalls = 0;
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      txCalls += 1;
      if (txCalls === 1) return fn(prisma);
      throw new Error('tx rollback');
    });
    const service = new V1MessagesService(
      prisma as never,
      { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await expect(
      service.send(project, 'acc1', textInput, 'idem-key-rollback'),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
    const rolledBackFailed = prisma.outboundMessageLog.updateMany.mock.calls.filter(
      (call) => (call[0] as { data?: { status?: string } }).data?.status === 'FAILED',
    );
    expect(rolledBackFailed).toHaveLength(0);
    expect(txCalls).toBe(2);
  });

  it('persists SENT and SUCCEEDED inside the post-WAHA transaction', async () => {
    const prisma = prismaForFresh(connected('acc1', 'wa_sess'));
    const service = new V1MessagesService(
      prisma as never,
      { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) } as never,
      { effectiveSessionName: (a: { sessionName: string }) => a.sessionName } as never,
      buildConfig() as never,
    );
    await service.send(project, 'acc1', textInput, 'idem-key-tx');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.outboundMessageLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(prisma.outboundMessageIdempotency.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });
});
