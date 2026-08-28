import { SessionStatus } from '../../src/common/db-enums';
import { V1MessagesService } from '../../src/v1/v1-messages.service';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { WahaApiError, WahaTransportError } from '../../src/waha/types/waha.types';

jest.mock('../../src/messages/media-url-validation', () => ({
  validateMediaUrl: jest.fn().mockResolvedValue({ href: 'https://cdn.example.com/a.jpg' }),
  filenameFromUrl: () => 'a.jpg',
  mimetypeForImagePath: () => 'image/jpeg',
  mimetypeForVideoPath: () => 'video/mp4',
}));

const project = { apiTokenId: 't1', projectId: 'p1' };
const textInput = { type: 'TEXT' as const, chatId: '37499111222@c.us', text: 'Hello' };

const buildConfig = (overrides: Record<string, number> = {}) => ({
  get: jest.fn((key: string) => {
    if (key in overrides) return overrides[key];
    if (key === 'MAX_TEXT_LENGTH') return 4096;
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

const prismaFor = (account: ReturnType<typeof connected> | null) => ({
  whatsappAccount: {
    findFirst: jest.fn().mockResolvedValue(account),
  },
});

const wahaSession = {
  effectiveSessionName: (a: { sessionName: string }) => a.sessionName,
};

const KEY = 'send-key-01';

const freshStore = () => ({
  begin: jest.fn().mockResolvedValue({ kind: 'fresh' as const, id: 'op1' }),
  succeed: jest.fn().mockResolvedValue(undefined),
  fail: jest.fn().mockResolvedValue(undefined),
  purgeExpired: jest.fn(),
});

const serviceFor = (
  account: ReturnType<typeof connected> | null,
  waha: object,
  config: ReturnType<typeof buildConfig> = buildConfig(),
  store = freshStore(),
) =>
  new V1MessagesService(
    prismaFor(account) as never,
    waha as never,
    wahaSession as never,
    config as never,
    store as never,
  );

describe('V1MessagesService', () => {
  it('sends Account A and Account B through different WAHA session names', async () => {
    const wahaClient = { sendText: jest.fn().mockResolvedValue({ id: 'w1' }) };
    const serviceA = serviceFor(connected('acc-a', 'wa_aaa'), wahaClient);
    const serviceB = serviceFor(connected('acc-b', 'wa_bbb'), wahaClient);
    const first = await serviceA.send(project, 'acc-a', textInput, KEY);
    const second = await serviceB.send(project, 'acc-b', textInput, KEY);
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
    expect(first).toEqual(expect.objectContaining({ messageId: 'w1', status: 'sent' }));
    expect(second.status).toBe('sent');
  });

  it('returns requestId and WAHA messageId and persists success', async () => {
    const sendText = jest.fn().mockResolvedValue({ id: 'w1' });
    const store = freshStore();
    const service = serviceFor(connected('acc1', 'wa_sess'), { sendText }, buildConfig(), store);
    const result = await service.send(project, 'acc1', textInput, KEY);
    expect(result.messageId).toBe('w1');
    expect(result.requestId).toMatch(/^req_/);
    expect(result.status).toBe('sent');
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(store.succeed).toHaveBeenCalled();
  });

  it('replays a stored success without calling WAHA', async () => {
    const sendText = jest.fn();
    const stored = {
      requestId: 'req_old',
      messageId: 'w-old',
      status: 'sent',
      sentAt: '2026-08-28T00:00:00.000Z',
    };
    const store = {
      ...freshStore(),
      begin: jest.fn().mockResolvedValue({
        kind: 'replay',
        status: 'SUCCEEDED',
        resultJson: JSON.stringify(stored),
        errorCode: null,
      }),
    };
    const service = serviceFor(connected('acc1', 'wa_sess'), { sendText }, buildConfig(), store);
    await expect(service.send(project, 'acc1', textInput, KEY)).resolves.toEqual(stored);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('maps transport errors to MESSAGE_OUTCOME_UNKNOWN', async () => {
    const store = freshStore();
    const service = serviceFor(
      connected('acc1', 'wa_sess'),
      { sendText: jest.fn().mockRejectedValue(new WahaTransportError('timeout')) },
      buildConfig(),
      store,
    );
    await expect(service.send(project, 'acc1', textInput, KEY)).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_OUTCOME_UNKNOWN,
    });
    expect(store.fail).toHaveBeenCalled();
  });

  it('maps WAHA HTTP errors to MESSAGE_SEND_FAILED', async () => {
    const service = serviceFor(connected('acc1', 'wa_sess'), {
      sendText: jest.fn().mockRejectedValue(new WahaApiError('upstream body', 500)),
    });
    await expect(service.send(project, 'acc1', textInput, KEY)).rejects.toMatchObject({
      code: ERROR_CODES.MESSAGE_SEND_FAILED,
    });
  });

  it('maps IMAGE WAHA errors to IMAGE_SEND_FAILED', async () => {
    const sendImageByUrl = jest.fn().mockRejectedValue(new WahaApiError('bad', 500));
    const service = new V1MessagesService(
      prismaFor(connected('acc1', 'wa_sess')) as never,
      { sendImageByUrl } as never,
      { ...wahaSession, sendImageByUrl } as never,
      buildConfig() as never,
      freshStore() as never,
    );
    await expect(
      service.send(
        project,
        'acc1',
        {
          type: 'IMAGE',
          chatId: '37499111222@c.us',
          mediaUrl: 'https://cdn.example.com/a.jpg',
        },
        KEY,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.IMAGE_SEND_FAILED });
  });

  it('enforces MAX_TEXT_LENGTH before calling WAHA', async () => {
    const sendText = jest.fn();
    const service = serviceFor(
      connected('acc1', 'wa_sess'),
      { sendText },
      buildConfig({ MAX_TEXT_LENGTH: 3 }),
    );
    await expect(
      service.send(
        project,
        'acc1',
        {
          type: 'TEXT',
          chatId: '37499111222@c.us',
          text: 'Hello world',
        },
        KEY,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('rejects a disconnected account before WAHA', async () => {
    const sendText = jest.fn();
    const service = serviceFor(
      connected('acc1', 'wa_sess', SessionStatus.DISCONNECTED),
      { sendText },
    );
    await expect(service.send(project, 'acc1', textInput, KEY)).rejects.toMatchObject({
      code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
    });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a missing account', async () => {
    const sendText = jest.fn();
    const service = serviceFor(null, { sendText });
    await expect(service.send(project, 'acc-missing', textInput, KEY)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(sendText).not.toHaveBeenCalled();
  });
});
