import {
  applyGroupSearch,
  mergeRecentChatOrder,
  paginateGroups,
} from '../../src/groups/group-catalog';
import type { NormalizedGroup } from '../../src/groups/types/group.types';

const group = (id: string, name: string): NormalizedGroup => ({
  id,
  name,
  participantCount: null,
  pictureUrl: null,
});

describe('group-catalog', () => {
  it('searches the full catalog, not only the first page', () => {
    const catalog = [
      group('120363111111111111@g.us', '$Ardana.ru'),
      group('120363222222222222@g.us', 'Qualitech'),
      group('120363333333333333@g.us', 'Estate Data'),
    ];
    expect(applyGroupSearch(catalog, 'estate')).toEqual([
      group('120363333333333333@g.us', 'Estate Data'),
    ]);
    expect(applyGroupSearch(catalog, '1203632222')).toHaveLength(1);
  });

  it('puts recent WhatsApp chats first and fills empty names', () => {
    const catalog = [
      group('120363111111111111@g.us', '$Ardana.ru'),
      group('120363222222222222@g.us', ''),
    ];
    const merged = mergeRecentChatOrder(catalog, [
      { id: '120363222222222222@g.us', name: 'Qualitech' },
      { id: '37499111222@c.us', name: 'Person' },
    ]);
    expect(merged.map((item) => item.id)).toEqual([
      '120363222222222222@g.us',
      '120363111111111111@g.us',
    ]);
    expect(merged[0]?.name).toBe('Qualitech');
  });

  it('ranks a year-old group above a newer one when its last message is later', () => {
    const catalog = [
      group('120363111111111111@g.us', 'YearOld'),
      group('120363222222222222@g.us', 'CreatedYesterday'),
    ];
    const merged = mergeRecentChatOrder(catalog, [
      {
        id: '120363222222222222@g.us',
        name: 'CreatedYesterday',
        lastMessage: { timestamp: 1_700_000_000 },
      },
      {
        id: '120363111111111111@g.us',
        name: 'YearOld',
        lastMessage: { timestamp: 1_800_000_000 },
      },
    ]);
    expect(merged.map((item) => item.id)).toEqual([
      '120363111111111111@g.us',
      '120363222222222222@g.us',
    ]);
  });

  it('paginates after search and sort', () => {
    const catalog = [group('120363111111111111@g.us', 'A'), group('120363222222222222@g.us', 'B')];
    expect(paginateGroups(catalog, 1, 1)).toEqual({
      groups: [group('120363222222222222@g.us', 'B')],
      pagination: { limit: 1, offset: 1, count: 1 },
    });
  });
});
