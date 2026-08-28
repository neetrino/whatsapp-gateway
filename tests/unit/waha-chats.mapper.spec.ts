import {
  mapWahaChatsPage,
  mapWahaMessage,
  mapWahaMessagesPage,
} from '../../src/waha/waha-chats.mapper';

describe('waha-chats.mapper', () => {
  it('maps chats without _data fields', () => {
    const page = mapWahaChatsPage(
      [
        {
          id: '37499111222@c.us',
          name: 'John',
          unreadCount: 2,
          lastMessage: { timestamp: 1_727_745_026 },
          _data: { secret: true },
        },
      ],
      10,
      0,
    );
    expect(page.items[0]).toEqual({
      id: '37499111222@c.us',
      name: 'John',
      lastMessageAt: new Date(1_727_745_026 * 1000).toISOString(),
      unreadCount: 2,
    });
    expect(JSON.stringify(page)).not.toContain('_data');
  });

  it('caps message body and sets bodyTruncated', () => {
    const mapped = mapWahaMessage(
      {
        id: 'false_37499111222@c.us_AAA',
        timestamp: 1_727_745_026,
        fromMe: false,
        body: 'Hello world',
        hasMedia: false,
        ackName: 'READ',
        _data: { text: 'secret' },
      },
      '37499111222@c.us',
      5,
    );
    expect(mapped).toMatchObject({
      body: 'Hello',
      bodyTruncated: true,
      type: 'text',
      ack: 'READ',
    });
    expect(JSON.stringify(mapped)).not.toContain('_data');
  });

  it('maps media metadata without downloading media', () => {
    const mapped = mapWahaMessage(
      {
        id: 'false_37499111222@c.us_BBB',
        timestamp: 1_727_745_026,
        fromMe: true,
        hasMedia: true,
        mimetype: 'image/jpeg',
        body: 'caption',
      },
      '37499111222@c.us',
      4096,
    );
    expect(mapped).toMatchObject({
      hasMedia: true,
      mediaType: 'image/jpeg',
      type: 'image',
      body: 'caption',
      bodyTruncated: false,
    });
  });

  it('maps messages page with limit and offset', () => {
    const page = mapWahaMessagesPage([], '37499111222@c.us', 20, 5, 4096);
    expect(page).toEqual({ items: [], limit: 20, offset: 5 });
  });
});
