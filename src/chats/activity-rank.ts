export type ActivityRank = {
  lastMessageAt: number | null;
  inboxIndex: number | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

export const extractLastMessageAtMs = (raw: unknown): number | null => {
  const record = asRecord(raw);
  if (!record) return null;
  const lastMessage = asRecord(record.lastMessage);
  const rawTs =
    asNumber(lastMessage?.timestamp) ??
    asNumber(record.conversationTimestamp) ??
    asNumber(record.messageTimestamp) ??
    asNumber(record.timestamp);
  if (rawTs === null || rawTs <= 0) return null;
  return rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs;
};

export const compareByLastActivity = <T extends ActivityRank & { id: string; name: string }>(
  left: T,
  right: T,
): number => {
  const leftLive = left.lastMessageAt !== null || left.inboxIndex !== null;
  const rightLive = right.lastMessageAt !== null || right.inboxIndex !== null;
  if (leftLive !== rightLive) return leftLive ? -1 : 1;
  if (!leftLive) return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  if (left.lastMessageAt !== null && right.lastMessageAt !== null) {
    const byTime = right.lastMessageAt - left.lastMessageAt;
    if (byTime !== 0) return byTime;
  }
  const leftIndex = left.inboxIndex ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = right.inboxIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
};

export const stripActivityRank = <T extends ActivityRank>(
  item: T,
): Omit<T, 'lastMessageAt' | 'inboxIndex'> => {
  const { lastMessageAt: _at, inboxIndex: _index, ...rest } = item;
  return rest;
};
