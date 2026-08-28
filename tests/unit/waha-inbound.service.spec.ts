import { WhatsappAccountMode } from '../../src/common/db-enums';
import { WahaInboundService } from '../../src/webhooks/waha-inbound.service';
import { computeWahaWebhookHmac } from '../../src/webhooks/waha-hmac';

describe('WahaInboundService', () => {
  const secret = 'test-webhook-secret-32-characters!!';
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'WAHA_WEBHOOK_SECRET') return secret;
      if (key === 'MAX_TEXT_LENGTH') return 4096;
      throw new Error(`unexpected key ${key}`);
    }),
  };

  const build = () => {
    const fanout = { deliver: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      whatsappAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'acc_m',
          projectId: 'p1',
          mode: WhatsappAccountMode.MESSENGER,
          isActive: true,
        }),
      },
    };
    const service = new WahaInboundService(prisma as never, config as never, fanout as never);
    return { service, fanout, prisma };
  };

  it('rejects invalid HMAC', () => {
    const { service } = build();
    const rawBody = Buffer.from('{}', 'utf8');
    expect(() =>
      service.verifyRequest(rawBody, {
        hmac: 'bad',
        hmacAlgorithm: 'sha512',
        timestamp: String(Date.now()),
      }),
    ).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('forwards normalized events for MESSENGER accounts', async () => {
    const { service, fanout } = build();
    const body = {
      event: 'message',
      session: 'wa_m',
      payload: {
        id: 'm1',
        timestamp: 1_727_745_026,
        from: '37499111222@c.us',
        fromMe: false,
        body: 'Hi',
      },
    };
    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {
      hmac: computeWahaWebhookHmac(rawBody, secret),
      hmacAlgorithm: 'sha512',
      requestId: 'req_1',
      timestamp: String(Date.now()),
    };
    service.verifyRequest(rawBody, headers);
    await service.handleEvent(rawBody, headers);
    expect(fanout.deliver).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ type: 'message.received', accountId: 'acc_m' }),
    );
  });

  it('drops SEND_ONLY accounts without deliver', async () => {
    const { service, fanout, prisma } = build();
    prisma.whatsappAccount.findUnique.mockResolvedValue({
      id: 'acc_s',
      projectId: 'p1',
      mode: WhatsappAccountMode.SEND_ONLY,
      isActive: true,
    });
    const body = {
      event: 'message',
      session: 'wa_s',
      payload: { id: 'm1', from: '37499111222@c.us' },
    };
    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    await service.handleEvent(rawBody, { requestId: 'req_1' });
    expect(fanout.deliver).not.toHaveBeenCalled();
  });

  it('drops inactive MESSENGER accounts without deliver', async () => {
    const { service, fanout, prisma } = build();
    prisma.whatsappAccount.findUnique.mockResolvedValue({
      id: 'acc_i',
      projectId: 'p1',
      mode: WhatsappAccountMode.MESSENGER,
      isActive: false,
    });
    const body = {
      event: 'message',
      session: 'wa_i',
      payload: { id: 'm1', from: '37499111222@c.us' },
    };
    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    await service.handleEvent(rawBody, { requestId: 'req_1' });
    expect(fanout.deliver).not.toHaveBeenCalled();
  });
});
