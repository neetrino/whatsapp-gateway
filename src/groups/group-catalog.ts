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

export const WAHA_GROUPS_PAGE = 200;
export const GROUP_CATALOG_CAP = 2000;

const byNameThenId = (left: NormalizedGroup, right: NormalizedGroup): number =>
  left.name.localeCompare(right.name) || left.id.localeCompare(right.id);

export const applyGroupSearch = (
  groups: NormalizedGroup[],
  search?: string,
): NormalizedGroup[] => {
  if (!search) return groups;
  const needle = search.toLowerCase();
  return groups.filter(
    (group) =>
      group.name.toLowerCase().includes(needle) || group.id.toLowerCase().includes(needle),
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
  const byId = new Map(groups.map((group) => [group.id.toLowerCase(), { ...group }]));
  const ordered: NormalizedGroup[] = [];
  const seen = new Set<string>();
  for (const chat of unwrapWahaList(chatsRaw)) {
    const fromChat = mapWahaGroup(chat);
    const id = fromChat?.id ?? extractGroupId(chat);
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    const existing = byId.get(key);
    const merged = existing
      ? { ...existing, name: existing.name || fromChat?.name || '' }
      : fromChat;
    if (!merged) continue;
    ordered.push(merged);
    seen.add(key);
  }
  const rest = groups.filter((group) => !seen.has(group.id.toLowerCase())).sort(byNameThenId);
  return [...ordered, ...rest];
};

export const fetchAllWahaGroups = async (
  list: (query: WahaListGroupsQuery) => Promise<unknown>,
): Promise<{ groups: NormalizedGroup[]; rawShape: ReturnType<typeof describeRawGroupsShape> }> => {
  const groups: NormalizedGroup[] = [];
  let firstRaw: unknown = [];
  for (let pageIndex = 0, offset = 0; pageIndex < 10 && groups.length < GROUP_CATALOG_CAP; pageIndex++) {
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
