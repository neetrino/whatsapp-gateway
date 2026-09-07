import {
  applyChatSearch,
  buildChatCatalog,
  classifyChatId,
  fetchRecentWahaChats,
  loadWahaInboxChats,
  mapWahaChatItem,
  paginateChats,
} from '../../src/chats/chat-catalog';
import type { NormalizedGroup } from '../../src/groups/types/group.types';

const group = (id: string, name: string): NormalizedGroup => ({
  id,
  name,
  participantCount: null,
  pictureUrl: null,
});

describe('chat-catalog', () => {
  it('classifies group and direct ids and drops others', () => {
    expect(classifyChatId('120363111111111111@g.us')).toBe('group');
    expect(classifyChatId('37499111222@c.us')).toBe('direct');
    expect(classifyChatId('37499111222@s.whatsapp.net')).toBe('direct');
    expect(classifyChatId('123@lid')).toBeNull();
  });

  it('maps a direct chat and ignores lid ids', () => {
    expect(mapWahaChatItem({ id: '37499111222@c.us', name: 'Armen' })).toEqual({
      id: '37499111222@c.us',
      name: 'Armen',
      type: 'direct',
    });
    expect(mapWahaChatItem({ id: '123@lid', name: 'Hidden' })).toBeNull();
    expect(mapWahaChatItem({ id: '37499111222@s.whatsapp.net', name: 'Armen' })).toEqual({
      id: '37499111222@c.us',
      name: 'Armen',
      type: 'direct',
    });
  });

  it('keeps group activity when inbox chats are missing', () => {
    const catalog = buildChatCatalog(
      [
        { ...group('120363111111111111@g.us', 'Idle'), lastMessageAt: 1_000 },
        { ...group('120363222222222222@g.us', 'Fresh'), lastMessageAt: 2_000 },
      ],
      [],
    );
    expect(catalog.map((item) => item.id)).toEqual([
      '120363222222222222@g.us',
      '120363111111111111@g.us',
    ]);
  });

  it('puts recent chats first and searches the full catalog', () => {
    const catalog = buildChatCatalog(
      [group('120363111111111111@g.us', '$Old'), group('120363222222222222@g.us', 'Qualitech')],
      [
        { id: '37499111222@c.us', name: 'Armen' },
        { id: '120363222222222222@g.us', name: 'Qualitech' },
      ],
    );
    expect(catalog.map((item) => item.id)).toEqual([
      '37499111222@c.us',
      '120363222222222222@g.us',
      '120363111111111111@g.us',
    ]);
    expect(applyChatSearch(catalog, 'arm')).toEqual([
      { id: '37499111222@c.us', name: 'Armen', type: 'direct' },
    ]);
  });

  it('orders by last message time, not creation or list array order', () => {
    const catalog = buildChatCatalog(
      [group('120363111111111111@g.us', 'YearOld'), group('120363222222222222@g.us', 'Fresh')],
      [
        { id: '120363222222222222@g.us', name: 'Fresh', lastMessage: { timestamp: 1_700_000_000 } },
        {
          id: '120363111111111111@g.us',
          name: 'YearOld',
          lastMessage: { timestamp: 1_800_000_000 },
        },
      ],
    );
    expect(catalog.map((item) => item.id)).toEqual([
      '120363111111111111@g.us',
      '120363222222222222@g.us',
    ]);
  });

  it('loads overview without asking WAHA to sort by timestamp', async () => {
    const overview = jest
      .fn()
      .mockResolvedValue([
        { id: '37499111222@c.us', name: 'Armen', lastMessage: { timestamp: 1_800_000_000 } },
      ]);
    const fallback = jest.fn();
    const items = await loadWahaInboxChats(overview, fallback);
    expect(items).toHaveLength(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(overview).toHaveBeenCalledWith({ limit: 200, offset: 0 });
    expect(overview.mock.calls[0]?.[0]).not.toHaveProperty('sortBy');
  });

  it('falls back to listChats when overview is empty', async () => {
    const overview = jest.fn().mockResolvedValue([]);
    const fallback = jest.fn().mockResolvedValue([{ id: '37499111222@c.us', name: 'Armen' }]);
    const items = await loadWahaInboxChats(overview, fallback);
    expect(items).toEqual([{ id: '37499111222@c.us', name: 'Armen' }]);
  });

  it('falls back to listChats when overview fails', async () => {
    const overview = jest.fn().mockRejectedValue(new Error('overview down'));
    const fallback = jest.fn().mockResolvedValue([{ id: '37499111222@c.us', name: 'Armen' }]);
    const items = await loadWahaInboxChats(overview, fallback);
    expect(items).toEqual([{ id: '37499111222@c.us', name: 'Armen' }]);
  });

  it('pages inbox chats without sortBy', async () => {
    const list = jest.fn().mockResolvedValue([]);
    await fetchRecentWahaChats(list);
    expect(list).toHaveBeenCalledWith({ limit: 200, offset: 0 });
  });

  it('paginates after merge', () => {
    const items = [
      { id: '37499111222@c.us', name: 'A', type: 'direct' as const },
      { id: '120363111111111111@g.us', name: 'B', type: 'group' as const },
    ];
    expect(paginateChats(items, 1, 1)).toEqual({
      items: [items[1]],
      pagination: { limit: 1, offset: 1, count: 1 },
    });
  });
});
