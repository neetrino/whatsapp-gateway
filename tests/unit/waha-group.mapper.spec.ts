import {
  extractGroupId,
  mapWahaGroup,
  mapWahaGroups,
} from '../../src/groups/mappers/waha-group.mapper';

describe('waha-group.mapper', () => {
  it('maps NOWEB-like subject/id shape', () => {
    const mapped = mapWahaGroup({
      id: '120363123456789012@g.us',
      subject: 'ACME Website',
      participants: [{ id: '1@c.us' }, { id: '2@c.us' }],
    });
    expect(mapped).toEqual({
      id: '120363123456789012@g.us',
      name: 'ACME Website',
      participantCount: 2,
      pictureUrl: null,
    });
  });

  it('maps alternate name/gid/size shape', () => {
    const mapped = mapWahaGroup({
      gid: '120363999999999999@g.us',
      name: 'Alt Name',
      size: 7,
      pictureUrl: 'https://cdn.example.com/p.jpg',
    });
    expect(mapped).toEqual({
      id: '120363999999999999@g.us',
      name: 'Alt Name',
      participantCount: 7,
      pictureUrl: 'https://cdn.example.com/p.jpg',
    });
  });

  it('uses empty name when missing', () => {
    const mapped = mapWahaGroup({ id: '120363111111111111@g.us' });
    expect(mapped?.name).toBe('');
    expect(mapped?.participantCount).toBeNull();
  });

  it('rejects invalid ids', () => {
    expect(extractGroupId({ id: 'not-a-group' })).toBeNull();
    expect(mapWahaGroup({ id: '37499@c.us', subject: 'x' })).toBeNull();
  });

  it('does not leak raw provider fields', () => {
    const mapped = mapWahaGroup({
      id: '120363123456789012@g.us',
      subject: 'G',
      _data: { secret: true },
      engine: 'NOWEB',
    });
    expect(mapped).toEqual({
      id: '120363123456789012@g.us',
      name: 'G',
      participantCount: null,
      pictureUrl: null,
    });
    expect(mapped).not.toHaveProperty('_data');
  });

  it('maps arrays and wrapped payloads', () => {
    expect(
      mapWahaGroups({
        groups: [{ id: '120363123456789012@g.us', subject: 'A' }],
      }),
    ).toHaveLength(1);
  });
});
