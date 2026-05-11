import { SessionStatus } from '@prisma/client';
import { MessagesService } from '../../src/messages/messages.service';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

const buildConfig = (): { get: jest.Mock } => ({
  get: jest.fn((key: string) => (key === 'MAX_TEXT_LENGTH' ? 4096 : undefined)),
});

describe('MessagesService', () => {
  const whatsappAccountId = 'acc1';
  const sessionName = 'wa_sess';

  const buildPrisma = () => ({
    whatsappAccount: {
      findUnique: jest.fn().mockResolvedValue({
        id: whatsappAccountId,
        sessionName,
        isActive: true,
        status: SessionStatus.CONNECTED,
      }),
    },
    outboundMessageLog: {
      create: jest.fn().mockResolvedValue({ id: 'log1' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
  });

  const wahaServiceMock = () => ({
    effectiveSessionName: jest.fn((a: { sessionName: string }) => a.sessionName),
  });

  it('passes text unchanged to WAHA', async () => {
    const prisma = buildPrisma();
    const wahaClient = { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) };
    const wahaSvc = wahaServiceMock();
    const service = new MessagesService(
      prisma as never,
      wahaClient as never,
      wahaSvc as never,
      buildConfig() as never,
    );

    await service.send(
      { apiTokenId: 't1', whatsappAccountId, sessionName },
      { chatId: '37499111222@c.us', text: '  Hello\n' },
    );

    expect(wahaClient.sendText).toHaveBeenCalledWith(sessionName, '37499111222@c.us', '  Hello\n');
  });

  it('maps WAHA transport errors to WAHA_UNAVAILABLE', async () => {
    const prisma = buildPrisma();
    const wahaClient = {
      sendText: jest.fn().mockRejectedValue(new WahaTransportError('econnrefused')),
    };
    const service = new MessagesService(
      prisma as never,
      wahaClient as never,
      wahaServiceMock() as never,
      buildConfig() as never,
    );

    await expect(
      service.send(
        { apiTokenId: 't1', whatsappAccountId, sessionName },
        { chatId: '37499111222@c.us', text: 'Hi' },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.WAHA_UNAVAILABLE });
  });

  it('maps WAHA API errors to MESSAGE_SEND_FAILED', async () => {
    const prisma = buildPrisma();
    const wahaClient = {
      sendText: jest.fn().mockRejectedValue(new WahaApiError('bad', 500)),
    };
    const service = new MessagesService(
      prisma as never,
      wahaClient as never,
      wahaServiceMock() as never,
      buildConfig() as never,
    );

    await expect(
      service.send(
        { apiTokenId: 't1', whatsappAccountId, sessionName },
        { chatId: '120363123456789012@g.us', text: 'Hi' },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.MESSAGE_SEND_FAILED });
  });

  it('rejects blank text after trim', async () => {
    const prisma = buildPrisma();
    const wahaClient = { sendText: jest.fn() };
    const service = new MessagesService(
      prisma as never,
      wahaClient as never,
      wahaServiceMock() as never,
      buildConfig() as never,
    );

    await expect(
      service.send(
        { apiTokenId: 't1', whatsappAccountId, sessionName },
        { chatId: '37499111222@c.us', text: '   ' },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });

    expect(wahaClient.sendText).not.toHaveBeenCalled();
  });
});
