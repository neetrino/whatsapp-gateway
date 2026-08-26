import { SessionStatus, WhatsappAccountMode } from '@prisma/client';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { AccountModePolicyService } from '../../src/waha/account-mode-policy.service';
import { V1ChatsService } from '../../src/v1/v1-chats.service';

const project = { apiTokenId: 't1', projectId: 'p1' };

type TestAccount = {
  id: string;
  sessionName: string;
  isActive: boolean;
  status: SessionStatus;
  label: string;
  mode: WhatsappAccountMode;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const messengerAccount: TestAccount = {
  id: 'acc1',
  sessionName: 'wa_sess',
  isActive: true,
  status: SessionStatus.CONNECTED,
  label: 'A',
  mode: WhatsappAccountMode.MESSENGER,
  phoneNumber: '37499111222',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('V1ChatsService', () => {
  const build = (overrides: {
    listChats?: jest.Mock;
    listChatMessages?: jest.Mock;
    storeEnabled?: boolean;
    account?: TestAccount;
    modePolicy?: AccountModePolicyService;
  } = {}) => {
    const prisma = {
      whatsappAccount: {
        findFirst: jest.fn().mockResolvedValue(overrides.account ?? messengerAccount),
      },
    };
    const client = {
      listChats: overrides.listChats ?? jest.fn().mockResolvedValue([]),
      listChatMessages: overrides.listChatMessages ?? jest.fn().mockResolvedValue([]),
    };
    const modePolicy =
      overrides.modePolicy ??
      ({
        assertMessengerMode: jest.fn(),
        isStoreEnabled: jest.fn().mockResolvedValue(overrides.storeEnabled ?? true),
      } as unknown as AccountModePolicyService);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MAX_CHATS_PAGE') return 100;
        if (key === 'MAX_MESSAGES_PAGE') return 100;
        if (key === 'MAX_TEXT_LENGTH') return 4096;
        return undefined;
      }),
    };
    const service = new V1ChatsService(
      prisma as never,
      client as never,
      modePolicy as never,
      config as never,
    );
    return { service, client, modePolicy, prisma };
  };

  it('rejects SEND_ONLY accounts', async () => {
    const { service } = build({
      account: { ...messengerAccount, mode: WhatsappAccountMode.SEND_ONLY },
      modePolicy: new AccountModePolicyService({} as never, {
        get: jest.fn(),
      } as never),
    });
    await expect(service.listChats(project, 'acc1', {})).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_MODE_NOT_SUPPORTED,
    });
  });

  it('returns STORE_NOT_READY when WAHA store is disabled', async () => {
    const { service } = build({ storeEnabled: false });
    await expect(service.listChats(project, 'acc1', {})).rejects.toMatchObject({
      code: ERROR_CODES.STORE_NOT_READY,
    });
  });

  it('returns disconnected accounts as WHATSAPP_NOT_CONNECTED', async () => {
    const { service } = build({
      account: { ...messengerAccount, status: SessionStatus.DISCONNECTED },
    });
    await expect(service.listChats(project, 'acc1', {})).rejects.toMatchObject({
      code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
    });
  });

  it('proxies chats with downloadMedia=false on messages', async () => {
    const listChatMessages = jest.fn().mockResolvedValue([
      {
        id: 'm1',
        timestamp: 1_727_745_026,
        fromMe: false,
        body: 'Hi',
        hasMedia: false,
      },
    ]);
    const { service, client } = build({ listChatMessages });
    const result = await service.listMessages(project, 'acc1', '37499111222@c.us', { limit: 10 });
    expect(client.listChatMessages).toHaveBeenCalledWith('wa_sess', '37499111222@c.us', {
      limit: 10,
      offset: 0,
    });
    expect(result.items[0]?.body).toBe('Hi');
  });
});
