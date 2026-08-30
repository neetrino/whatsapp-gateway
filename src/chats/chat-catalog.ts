import { GROUP_ID_REGEX, PARTICIPANT_JID_REGEX } from '../groups/constants/group.constants';
import { extractGroupName } from '../groups/mappers/waha-group.mapper';
import type { NormalizedGroup } from '../groups/types/group.types';
import { unwrapWahaList } from '../waha/waha-chats.mapper';
import type { ChatListItem, ChatType, ChatsListResult } from './chats.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readJid = (value: unknown): string | undefined => {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return undefined;
  return (
    asString(record._serialized) ??
    asString(record.serialized) ??
    (asString(record.user) && asString(record.server)
      ? `${asString(record.user)}@${asString(record.server)}`
      : undefined)
  );
};

export const classifyChatId = (id: string): ChatType | null => {
  if (GROUP_ID_REGEX.test(id)) return 'group';
  if (PARTICIPANT_JID_REGEX.test(id)) return 'direct';
  return null;
};

export const extractChatId = (raw: unknown): string | null => {
  if (typeof raw === 'string') {
    const id = raw.trim();
    return classifyChatId(id) ? id : null;
  }
  const record = asRecord(raw);
  if (!record) return null;
  for (const candidate of [record.id, record.JID, record.jid, record.chatId]) {
    const id = readJid(candidate);
    if (id && classifyChatId(id)) return id;
  }
  return null;
};

export const mapWahaChatItem = (raw: unknown): ChatListItem | null => {
  const id = extractChatId(raw);
  if (!id) return null;
  const type = classifyChatId(id);
  if (!type) return null;
  return { id, name: extractGroupName(raw), type };
};

const byNameThenId = (left: ChatListItem, right: ChatListItem): number =>
  left.name.localeCompare(right.name) || left.id.localeCompare(right.id);

export const applyChatSearch = (items: ChatListItem[], search?: string): ChatListItem[] => {
  if (!search) return items;
  const needle = search.toLowerCase();
  return items.filter(
    (item) => item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle),
  );
};

export const paginateChats = (
  items: ChatListItem[],
  limit: number,
  offset: number,
): ChatsListResult => {
  const page = items.slice(offset, offset + limit);
  return { items: page, pagination: { limit, offset, count: page.length } };
};

export const buildChatCatalog = (groups: NormalizedGroup[], chatsRaw: unknown): ChatListItem[] => {
  const byId = new Map<string, ChatListItem>(
    groups.map((group) => [
      group.id.toLowerCase(),
      { id: group.id, name: group.name, type: 'group' as const },
    ]),
  );
  const ordered: ChatListItem[] = [];
  const seen = new Set<string>();
  for (const chat of unwrapWahaList(chatsRaw)) {
    const fromChat = mapWahaChatItem(chat);
    if (!fromChat) continue;
    const key = fromChat.id.toLowerCase();
    if (seen.has(key)) continue;
    const existing = byId.get(key);
    ordered.push(existing ? { ...existing, name: existing.name || fromChat.name } : fromChat);
    seen.add(key);
    byId.delete(key);
  }
  const rest = [...byId.values()].sort(byNameThenId);
  return [...ordered, ...rest];
};
