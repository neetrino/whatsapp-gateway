import { WhatsappAccountMode } from '@prisma/client';
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
    const deliveryService = { enqueueDelivery: jest.fn() };
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
    const service = new WahaInboundService(
      prisma as never,
      config as never,
      deliveryService as never,
    );
    return { service, deliveryService, prisma };
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
    const { service, deliveryService } = build();
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
    expect(deliveryService.enqueueDelivery).toHaveBeenCalledWith(
      'p1',
      'acc_m',
      expect.objectContaining({ type: 'message.received' }),
      'req_1',
    );
  });

  it('drops SEND_ONLY accounts without enqueue', async () => {
    const { service, deliveryService, prisma } = build();
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
    expect(deliveryService.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('drops inactive MESSENGER accounts without enqueue', async () => {
    const { service, deliveryService, prisma } = build();
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
    expect(deliveryService.enqueueDelivery).not.toHaveBeenCalled();
  });
});
