import {
  applyChatSearch,
  buildChatCatalog,
  classifyChatId,
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
    expect(classifyChatId('123@lid')).toBeNull();
  });

  it('maps a direct chat and ignores lid ids', () => {
    expect(mapWahaChatItem({ id: '37499111222@c.us', name: 'Armen' })).toEqual({
      id: '37499111222@c.us',
      name: 'Armen',
      type: 'direct',
    });
    expect(mapWahaChatItem({ id: '123@lid', name: 'Hidden' })).toBeNull();
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
