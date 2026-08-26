import { mapWahaEventToProjectPayload } from '../../src/webhooks/waha-event.mapper';

describe('waha-event.mapper', () => {
  it('maps inbound messages without raw WAHA fields', () => {
    const payload = mapWahaEventToProjectPayload(
      'acc1',
      'message',
      {
        id: 'false_37499111222@c.us_AAA',
        timestamp: 1_727_745_026,
        from: '37499111222@c.us',
        fromMe: false,
        body: 'Hello',
        hasMedia: false,
        _data: { secret: true },
      },
      4096,
    );
    expect(payload).toMatchObject({
      accountId: 'acc1',
      type: 'message.received',
      data: {
        chatId: '37499111222@c.us',
        body: 'Hello',
        bodyTruncated: false,
      },
    });
    expect(JSON.stringify(payload)).not.toContain('_data');
  });

  it('skips outbound echo messages', () => {
    const payload = mapWahaEventToProjectPayload(
      'acc1',
      'message',
      { id: 'x', timestamp: 1, fromMe: true, from: '37499111222@c.us' },
      4096,
    );
    expect(payload).toBeNull();
  });

  it('maps message.ack statuses', () => {
    const payload = mapWahaEventToProjectPayload(
      'acc1',
      'message.ack',
      { id: 'msg1', ack: 3, ackName: 'READ', from: '37499111222@c.us', fromMe: true },
      4096,
    );
    expect(payload?.type).toBe('message.ack');
    expect(payload?.data).toMatchObject({ ackName: 'READ', messageId: 'msg1' });
  });
});
