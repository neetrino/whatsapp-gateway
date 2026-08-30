import { GROUP_ID_REGEX } from './constants/group.constants';
import { extractGroupName } from './mappers/waha-group.mapper';

export const NAME_HYDRATE_MAX = 8;

export const hydrateEmptyGroupNames = async <T extends { id: string; name: string }>(
  items: T[],
  loadRaw: (groupId: string) => Promise<unknown>,
  max = NAME_HYDRATE_MAX,
): Promise<T[]> => {
  const targets = items
    .filter((item) => item.name.length === 0 && GROUP_ID_REGEX.test(item.id))
    .slice(0, max);
  if (targets.length === 0) return items;
  const resolved = await Promise.all(
    targets.map(async (item) => {
      try {
        return [item.id, extractGroupName(await loadRaw(item.id))] as const;
      } catch {
        return [item.id, ''] as const;
      }
    }),
  );
  const names = new Map(resolved.filter(([, name]) => name.length > 0));
  if (names.size === 0) return items;
  return items.map((item) => {
    const name = names.get(item.id);
    return name ? { ...item, name } : item;
  });
};
