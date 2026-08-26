import { ThrottlerStorage } from '@nestjs/throttler';

interface Bucket {
  hits: Map<string, number>;
  expiresAt: number;
}

export const DEFAULT_THROTTLE_MAX_KEYS = 10_000;

export class BoundedThrottlerStorage implements ThrottlerStorage {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly maxKeys: number = DEFAULT_THROTTLE_MAX_KEYS) {}

  get size(): number {
    return this.buckets.size;
  }

  reset(): void {
    this.buckets.clear();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const now = Date.now();
    this.evictExpired(now);
    this.enforceMax();
    const bucket = this.touch(key, now, ttl);
    const totalHits = (bucket.hits.get(throttlerName) ?? 0) + 1;
    bucket.hits.set(throttlerName, totalHits);
    const timeToExpire = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000));
    const isBlocked = totalHits > limit;
    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }

  private touch(key: string, now: number, ttl: number): Bucket {
    const current = this.buckets.get(key);
    if (!current || current.expiresAt <= now) {
      const created: Bucket = { hits: new Map(), expiresAt: now + ttl };
      this.buckets.set(key, created);
      return created;
    }
    this.buckets.delete(key);
    this.buckets.set(key, current);
    return current;
  }

  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }

  private enforceMax(): void {
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.buckets.delete(oldest);
    }
  }
}
