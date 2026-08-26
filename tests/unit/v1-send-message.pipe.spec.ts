import { V1SendMessagePipe } from '../../src/v1/v1-send-message.pipe';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { maskPhoneNumber } from '../../src/whatsapp-accounts/account-public';

describe('V1SendMessagePipe', () => {
  const pipe = new V1SendMessagePipe();

  it('accepts a TEXT payload and rejects unknown fields', async () => {
    const ok = await pipe.transform({
      type: 'TEXT',
      chatId: '37499111222@c.us',
      text: 'Hi',
    });
    expect(ok).toEqual({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi' });
    await expect(
      pipe.transform({ type: 'TEXT', chatId: '37499111222@c.us', text: 'Hi', extra: true }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('rejects TEXT payloads that include mediaUrl', async () => {
    await expect(
      pipe.transform({
        type: 'TEXT',
        chatId: '37499111222@c.us',
        text: 'Hi',
        mediaUrl: 'https://cdn.example.com/a.jpg',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('accepts IMAGE and VIDEO payloads', async () => {
    await expect(
      pipe.transform({
        type: 'IMAGE',
        chatId: '37499111222@c.us',
        mediaUrl: 'https://cdn.example.com/a.jpg',
      }),
    ).resolves.toMatchObject({ type: 'IMAGE' });
    await expect(
      pipe.transform({
        type: 'VIDEO',
        chatId: '120363123456789012@g.us',
        mediaUrl: 'https://cdn.example.com/a.mp4',
        caption: 'clip',
      }),
    ).resolves.toMatchObject({ type: 'VIDEO' });
  });
});

describe('maskPhoneNumber', () => {
  it('masks all but the last four digits', () => {
    expect(maskPhoneNumber('37499111222')).toBe('•••••••1222');
  });
});
