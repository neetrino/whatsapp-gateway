import {
  applyGroupSearch,
  fetchAllWahaGroups,
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

  it('keeps paging a full JID map instead of stopping at 200', async () => {
    const page = (
      start: number,
      count: number,
    ): Record<string, { id: string; subject: string }> => {
      const raw: Record<string, { id: string; subject: string }> = {};
      for (let index = 0; index < count; index += 1) {
        const n = start + index;
        const id = `120363${String(n).padStart(12, '0')}@g.us`;
        raw[id] = { id, subject: `G${n}` };
      }
      return raw;
    };
    const list = jest.fn().mockResolvedValueOnce(page(1, 200)).mockResolvedValueOnce(page(201, 5));
    const { groups } = await fetchAllWahaGroups(list);
    expect(groups).toHaveLength(205);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 200 }));
  });

  it('stops when a full JID map page adds no new groups', async () => {
    const page = (count: number): Record<string, { id: string; subject: string }> => {
      const raw: Record<string, { id: string; subject: string }> = {};
      for (let index = 1; index <= count; index += 1) {
        const id = `120363${String(index).padStart(12, '0')}@g.us`;
        raw[id] = { id, subject: `G${index}` };
      }
      return raw;
    };
    const same = page(200);
    const list = jest.fn().mockResolvedValue(same);
    const { groups } = await fetchAllWahaGroups(list);
    expect(groups).toHaveLength(200);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('paginates after search and sort', () => {
    const catalog = [group('120363111111111111@g.us', 'A'), group('120363222222222222@g.us', 'B')];
    expect(paginateGroups(catalog, 1, 1)).toEqual({
      groups: [group('120363222222222222@g.us', 'B')],
      pagination: { limit: 1, offset: 1, count: 1 },
    });
  });
});
