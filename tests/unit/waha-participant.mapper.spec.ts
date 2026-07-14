import {
  extractInviteCode,
  mapWahaParticipant,
  mapWahaParticipants,
} from '../../src/groups/mappers/waha-participant.mapper';

describe('waha-participant.mapper', () => {
  it('maps participant / admin / superadmin / left', () => {
    expect(mapWahaParticipant({ id: '37499123456@c.us', role: 'participant' })).toMatchObject({
      phone: '37499123456',
      role: 'participant',
      isAdmin: false,
      isSuperAdmin: false,
    });
    expect(mapWahaParticipant({ id: '37499123456@c.us', role: 'admin' })).toMatchObject({
      role: 'admin',
      isAdmin: true,
      isSuperAdmin: false,
    });
    expect(mapWahaParticipant({ id: '37499123456@c.us', role: 'superadmin' })).toMatchObject({
      role: 'superadmin',
      isAdmin: true,
      isSuperAdmin: true,
    });
    expect(mapWahaParticipant({ id: '37499123456@c.us', role: 'left' })).toMatchObject({
      role: 'left',
      isAdmin: false,
    });
  });

  it('maps unknown role safely', () => {
    expect(mapWahaParticipant({ id: '37499123456@c.us', role: 'owner' })?.role).toBe('unknown');
  });

  it('maps @lid without inventing phone', () => {
    const mapped = mapWahaParticipant({ id: 'abc123@lid', role: 'participant' });
    expect(mapped).toEqual({
      id: 'abc123@lid',
      phone: null,
      role: 'participant',
      isAdmin: false,
      isSuperAdmin: false,
    });
  });

  it('unwraps participants arrays', () => {
    expect(
      mapWahaParticipants({
        participants: [{ id: '37499123456@c.us', role: 'participant' }],
      }),
    ).toHaveLength(1);
  });

  it('extracts invite code from string or object', () => {
    expect(extractInviteCode('AbCdEfGh')).toBe('AbCdEfGh');
    expect(extractInviteCode('https://chat.whatsapp.com/AbCdEfGh')).toBe('AbCdEfGh');
    expect(extractInviteCode({ code: 'AbCdEfGh12' })).toBe('AbCdEfGh12');
  });
});
