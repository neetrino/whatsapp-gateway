import { seedGroupActivityAt, type GroupCatalogInput } from '../chats/chat-catalog';
import {
  compareByLastActivity,
  extractLastMessageAtMs,
  stripActivityRank,
  type ActivityRank,
} from '../chats/activity-rank';
import type { WahaListGroupsQuery } from '../waha/types/waha.types';
import { unwrapWahaList } from '../waha/waha-chats.mapper';
import {
  describeRawGroupsShape,
  extractGroupId,
  mapWahaGroup,
  unwrapGroupsArray,
} from './mappers/waha-group.mapper';
import type { GroupsListResult, NormalizedGroup } from './types/group.types';

type RankedGroup = NormalizedGroup & ActivityRank;
export type GroupWithActivity = NormalizedGroup & { lastMessageAt: number | null };

export const mapWahaGroupsWithActivity = (raw: unknown): GroupWithActivity[] => {
  const mapped: GroupWithActivity[] = [];
  for (const item of unwrapGroupsArray(raw)) {
    const group = mapWahaGroup(item);
    if (group) mapped.push({ ...group, lastMessageAt: extractLastMessageAtMs(item) });
  }
  return mapped;
};

export const WAHA_GROUPS_PAGE = 200;
export const GROUP_CATALOG_CAP = 2000;

export const applyGroupSearch = (groups: NormalizedGroup[], search?: string): NormalizedGroup[] => {
  if (!search) return groups;
  const needle = search.toLowerCase();
  return groups.filter(
    (group) => group.name.toLowerCase().includes(needle) || group.id.toLowerCase().includes(needle),
  );
};

export const paginateGroups = (
  groups: NormalizedGroup[],
  limit: number,
  offset: number,
): GroupsListResult => {
  const page = groups.slice(offset, offset + limit);
  return { groups: page, pagination: { limit, offset, count: page.length } };
};

export const mergeRecentChatOrder = (
  groups: GroupCatalogInput[],
  chatsRaw: unknown,
): NormalizedGroup[] => {
  const byId = new Map<string, RankedGroup>();
  for (const group of groups) {
    byId.set(group.id.toLowerCase(), {
      ...group,
      lastMessageAt: seedGroupActivityAt(group),
      inboxIndex: null,
    });
  }
  let inboxIndex = 0;
  for (const chat of unwrapWahaList(chatsRaw)) {
    const fromChat = mapWahaGroup(chat);
    const id = fromChat?.id ?? extractGroupId(chat);
    if (!id) continue;
    const key = id.toLowerCase();
    const existing = byId.get(key);
    if (existing && existing.inboxIndex !== null) {
      inboxIndex += 1;
      continue;
    }
    const merged = existing
      ? {
          ...existing,
          name: existing.name || fromChat?.name || '',
          lastMessageAt: extractLastMessageAtMs(chat) ?? existing.lastMessageAt,
          inboxIndex,
        }
      : fromChat
        ? { ...fromChat, lastMessageAt: extractLastMessageAtMs(chat), inboxIndex }
        : null;
    if (merged) byId.set(key, merged);
    inboxIndex += 1;
  }
  return [...byId.values()].sort(compareByLastActivity).map(stripActivityRank);
};

export const fetchAllWahaGroups = async (
  list: (query: WahaListGroupsQuery) => Promise<unknown>,
): Promise<{
  groups: GroupWithActivity[];
  rawShape: ReturnType<typeof describeRawGroupsShape>;
}> => {
  const groups: GroupWithActivity[] = [];
  const seen = new Set<string>();
  let firstRaw: unknown = [];
  for (
    let pageIndex = 0, offset = 0;
    pageIndex < 10 && groups.length < GROUP_CATALOG_CAP;
    pageIndex++
  ) {
    const raw = await list({
      limit: WAHA_GROUPS_PAGE,
      offset,
      sortBy: 'subject',
      sortOrder: 'asc',
      exclude: 'participants',
    });
    if (pageIndex === 0) firstRaw = raw;
    const page = mapWahaGroupsWithActivity(raw);
    const fresh = page.filter((group) => {
      const key = group.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) break;
    groups.push(...fresh);
    offset += page.length;
    if (page.length < WAHA_GROUPS_PAGE) break;
  }
  return { groups, rawShape: describeRawGroupsShape(firstRaw) };
};
