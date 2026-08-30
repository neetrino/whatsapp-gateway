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
  isWahaGroupsJidMap,
  mapWahaGroup,
  mapWahaGroups,
} from './mappers/waha-group.mapper';
import type { GroupsListResult, NormalizedGroup } from './types/group.types';

type RankedGroup = NormalizedGroup & ActivityRank;

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

export const dedupeGroups = (groups: NormalizedGroup[]): NormalizedGroup[] => {
  const seen = new Set<string>();
  const unique: NormalizedGroup[] = [];
  for (const group of groups) {
    const key = group.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(group);
  }
  return unique;
};

export const mergeRecentChatOrder = (
  groups: NormalizedGroup[],
  chatsRaw: unknown,
): NormalizedGroup[] => {
  const byId = new Map<string, RankedGroup>();
  for (const group of groups) {
    byId.set(group.id.toLowerCase(), { ...group, lastMessageAt: null, inboxIndex: null });
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
          lastMessageAt: extractLastMessageAtMs(chat),
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
): Promise<{ groups: NormalizedGroup[]; rawShape: ReturnType<typeof describeRawGroupsShape> }> => {
  const groups: NormalizedGroup[] = [];
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
    const page = mapWahaGroups(raw);
    if (isWahaGroupsJidMap(raw)) {
      return { groups: page, rawShape: describeRawGroupsShape(raw) };
    }
    if (page.length === 0) break;
    groups.push(...page);
    offset += page.length;
    if (page.length < WAHA_GROUPS_PAGE) break;
  }
  return { groups: dedupeGroups(groups), rawShape: describeRawGroupsShape(firstRaw) };
};
