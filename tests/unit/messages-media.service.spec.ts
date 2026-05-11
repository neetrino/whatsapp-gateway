import { SessionStatus, MessageType, MessageStatus } from '@prisma/client';
import { MessagesMediaService } from '../../src/messages/messages-media.service';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

jest.mock('../../src/messages/media-url-validation', () => ({
  validateMediaUrl: jest.fn().mockResolvedValue({ href: 'https://cdn.example.com/a.jpg' }),
  filenameFromUrl: () => 'a.jpg',
  mimetypeForImagePath: () => 'image/jpeg',
  mimetypeForVideoPath: () => 'video/mp4',
}));

const { validateMediaUrl } = jest.requireMock('../../src/messages/media-url-validation') as {
  validateMediaUrl: jest.Mock;
};

describe('MessagesMediaService', () => {
  const build = () => {
    const prisma = {
      whatsappAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'acc1',
          sessionName: 'wa_sess',
          isActive: true,
          status: SessionStatus.CONNECTED,
        }),
      },
      outboundMessageLog: {
        create: jest.fn().mockResolvedValue({ id: 'log1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const waha = {
      effectiveSessionName: jest.fn((a: { sessionName: string }) => a.sessionName),
      sendImageByUrl: jest.fn().mockResolvedValue({ id: 'img1' }),
      sendVideoByUrl: jest.fn().mockResolvedValue({ id: 'vid1' }),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MAX_IMAGE_SIZE_MB') return 10;
        if (key === 'MAX_VIDEO_SIZE_MB') return 50;
        if (key === 'MAX_CAPTION_LENGTH') return 100;
        return undefined;
      }),
    };
    const service = new MessagesMediaService(prisma as never, waha as never, config as never);
    return { service, prisma, waha };
  };

  beforeEach(() => {
    validateMediaUrl.mockResolvedValue({ href: 'https://cdn.example.com/a.jpg' });
  });

  it('calls sendImageByUrl, not sendText', async () => {
    const { service, waha } = build();
    await service.sendMedia(
      { apiTokenId: 't', whatsappAccountId: 'acc1', sessionName: 'x' },
      {
        chatId: '37499111222@c.us',
        mediaType: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/a.jpg',
        caption: '  Cap ',
      },
    );
    expect(waha.sendImageByUrl).toHaveBeenCalledWith(
      'wa_sess',
      '37499111222@c.us',
      'https://cdn.example.com/a.jpg',
      { mimetype: 'image/jpeg', filename: 'a.jpg' },
      '  Cap ',
    );
    expect(waha.sendVideoByUrl).not.toHaveBeenCalled();
  });

  it('calls sendVideoByUrl for VIDEO', async () => {
    validateMediaUrl.mockResolvedValueOnce({ href: 'https://cdn.example.com/v.mp4' });
    const { service, waha } = build();
    await service.sendMedia(
      { apiTokenId: 't', whatsappAccountId: 'acc1', sessionName: 'x' },
      {
        chatId: '37499111222@c.us',
        mediaType: 'VIDEO',
        mediaUrl: 'https://cdn.example.com/v.mp4',
      },
    );
    expect(waha.sendVideoByUrl).toHaveBeenCalled();
    expect(waha.sendImageByUrl).not.toHaveBeenCalled();
  });

  it('creates log with IMAGE messageType without mediaUrl', async () => {
    const { service, prisma } = build();
    await service.sendMedia(
      { apiTokenId: 't', whatsappAccountId: 'acc1', sessionName: 'x' },
      { chatId: '37499111222@c.us', mediaType: 'IMAGE', mediaUrl: 'https://x/y.jpg' },
    );
    expect(prisma.outboundMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageType: MessageType.IMAGE,
        chatId: '37499111222@c.us',
        status: MessageStatus.PENDING,
      }),
    });
    const createArg = prisma.outboundMessageLog.create.mock.calls[0][0].data;
    expect(createArg).not.toHaveProperty('mediaUrl');
    expect(createArg).not.toHaveProperty('caption');
  });

  it('maps WAHA API error to IMAGE_SEND_FAILED', async () => {
    const { service, waha, prisma } = build();
    waha.sendImageByUrl.mockRejectedValueOnce(new WahaApiError('x', 500));
    await expect(
      service.sendMedia(
        { apiTokenId: 't', whatsappAccountId: 'acc1', sessionName: 'x' },
        { chatId: '37499111222@c.us', mediaType: 'IMAGE', mediaUrl: 'https://x/y.jpg' },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.IMAGE_SEND_FAILED });
    expect(prisma.outboundMessageLog.update).toHaveBeenCalled();
  });

  it('maps WAHA transport error to WAHA_UNAVAILABLE', async () => {
    const { service, waha } = build();
    waha.sendVideoByUrl.mockRejectedValueOnce(new WahaTransportError('econnreset'));
    await expect(
      service.sendMedia(
        { apiTokenId: 't', whatsappAccountId: 'acc1', sessionName: 'x' },
        { chatId: '37499111222@c.us', mediaType: 'VIDEO', mediaUrl: 'https://x/y.mp4' },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.WAHA_UNAVAILABLE });
  });
});
