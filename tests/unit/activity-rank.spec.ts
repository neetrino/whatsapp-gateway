import { compareByLastActivity, extractLastMessageAtMs } from '../../src/chats/activity-rank';

describe('activity-rank', () => {
  it('reads lastMessage.timestamp in seconds', () => {
    expect(extractLastMessageAtMs({ lastMessage: { timestamp: 1_700_000_000 } })).toBe(
      1_700_000_000_000,
    );
  });

  it('reads millisecond timestamps without scaling', () => {
    expect(extractLastMessageAtMs({ conversationTimestamp: 1_700_000_000_123 })).toBe(
      1_700_000_000_123,
    );
  });

  it('sorts live chats above idle groups, newest message first', () => {
    const ranked = [
      { id: 'idle@g.us', name: 'Idle', lastMessageAt: null, inboxIndex: null },
      { id: 'old@g.us', name: 'Old', lastMessageAt: 1_000, inboxIndex: 0 },
      { id: 'new@g.us', name: 'New', lastMessageAt: 2_000, inboxIndex: 1 },
    ].sort(compareByLastActivity);
    expect(ranked.map((item) => item.id)).toEqual(['new@g.us', 'old@g.us', 'idle@g.us']);
  });
});
