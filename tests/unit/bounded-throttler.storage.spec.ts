import { BoundedThrottlerStorage } from '../../src/common/throttling/bounded-throttler.storage';

describe('BoundedThrottlerStorage', () => {
  it('evicts expired keys so attacker traffic cannot retain buckets', async () => {
    const storage = new BoundedThrottlerStorage(100);
    await storage.increment('token:a', 20, 10, 20, 'v1-send');
    expect(storage.size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await storage.increment('token:b', 60_000, 10, 60_000, 'v1-send');
    expect(storage.size).toBe(1);
  });

  it('enforces a hard maximum bucket count', async () => {
    const storage = new BoundedThrottlerStorage(8);
    for (let i = 0; i < 40; i += 1) {
      await storage.increment(`token:${i}`, 60_000, 1000, 60_000, 'v1-send');
    }
    expect(storage.size).toBeLessThanOrEqual(8);
  });

  it('rate-limits a single tracker after the named budget', async () => {
    const storage = new BoundedThrottlerStorage();
    const first = await storage.increment('token:x', 60_000, 2, 60_000, 'v1-send');
    const second = await storage.increment('token:x', 60_000, 2, 60_000, 'v1-send');
    const third = await storage.increment('token:x', 60_000, 2, 60_000, 'v1-send');
    expect(first.isBlocked).toBe(false);
    expect(second.isBlocked).toBe(false);
    expect(third.isBlocked).toBe(true);
    expect(third.totalHits).toBe(3);
  });
});
