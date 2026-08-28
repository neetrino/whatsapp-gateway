import {
  extractGroupId,
  isWahaGroupsJidMap,
  mapWahaGroups,
  unwrapGroupsArray,
} from '../../src/groups/mappers/waha-group.mapper';

describe('waha-group.mapper', () => {
  it('maps a NOWEB JID-keyed object that is not an array', () => {
    const raw = {
      '120363027401763616@g.us': {
        id: '120363027401763616@g.us',
        subject: 'Product A',
        size: 4,
      },
      '120363162025891667@g.us': {
        id: '120363162025891667@g.us',
        subject: 'Product B',
        size: 8,
      },
    };
    const groups = mapWahaGroups(raw);
    expect(isWahaGroupsJidMap(raw)).toBe(true);
    expect(groups).toEqual([
      {
        id: '120363027401763616@g.us',
        name: 'Product A',
        participantCount: 4,
        pictureUrl: null,
      },
      {
        id: '120363162025891667@g.us',
        name: 'Product B',
        participantCount: 8,
        pictureUrl: null,
      },
    ]);
  });

  it('reads JID and Name fields used by GOWS', () => {
    expect(
      mapWahaGroups([{ JID: '120363123456789012@g.us', Name: 'Ops' }]),
    ).toEqual([
      {
        id: '120363123456789012@g.us',
        name: 'Ops',
        participantCount: null,
        pictureUrl: null,
      },
    ]);
  });

  it('reads WEBJS id._serialized objects', () => {
    expect(
      extractGroupId({
        id: { server: 'g.us', user: '120363354628495296', _serialized: '120363354628495296@g.us' },
        name: '#2189',
      }),
    ).toBe('120363354628495296@g.us');
  });

  it('keeps array and { groups } wrappers working', () => {
    expect(unwrapGroupsArray([{ id: '120363123456789012@g.us' }])).toHaveLength(1);
    expect(
      unwrapGroupsArray({ groups: [{ id: '120363123456789012@g.us', subject: 'A' }] }),
    ).toHaveLength(1);
    expect(mapWahaGroups({ pagination: { limit: 20 }, groups: [] })).toEqual([]);
    expect(isWahaGroupsJidMap({ pagination: { limit: 20 }, groups: [] })).toBe(false);
  });
});
