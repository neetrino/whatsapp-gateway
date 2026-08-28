import { GROUP_ID_REGEX } from '../constants/group.constants';
import type { NormalizedGroup } from '../types/group.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};

const readJid = (value: unknown): string | undefined => {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return undefined;
  const serialized = asString(record._serialized) ?? asString(record.serialized);
  if (serialized) return serialized;
  const user = asString(record.user);
  const server = asString(record.server);
  if (user && server) return `${user}@${server}`;
  return undefined;
};

const firstMatchingGroupId = (...candidates: unknown[]): string | null => {
  for (const candidate of candidates) {
    const id = readJid(candidate);
    if (id && GROUP_ID_REGEX.test(id)) return id;
  }
  return null;
};

export const extractGroupId = (raw: unknown): string | null => {
  if (typeof raw === 'string' && GROUP_ID_REGEX.test(raw.trim())) return raw.trim();
  const record = asRecord(raw);
  if (!record) return null;

  const direct = firstMatchingGroupId(
    record.id,
    record.JID,
    record.jid,
    record.gid,
    record.groupId,
    record.chatId,
  );
  if (direct) return direct;

  const nested = asRecord(record.group) ?? asRecord(record.groupMetadata);
  if (!nested) return null;
  return firstMatchingGroupId(nested.id, nested.JID, nested.jid, nested.gid);
};

export const extractGroupName = (raw: unknown, fallback = ''): string => {
  const record = asRecord(raw);
  if (!record) return fallback;
  const nested = asRecord(record.group);
  return (
    asString(record.subject) ??
    asString(record.Subject) ??
    asString(record.name) ??
    asString(record.Name) ??
    asString(record.title) ??
    asString(nested?.subject) ??
    asString(nested?.name) ??
    fallback
  );
};

const extractParticipantCount = (raw: unknown): number | null => {
  const record = asRecord(raw);
  if (!record) return null;

  const explicit =
    asNumber(record.participantCount) ??
    asNumber(record.participantsCount) ??
    asNumber(record.size) ??
    asNumber(asRecord(record.groupMetadata)?.size);
  if (explicit !== null) return explicit;

  if (Array.isArray(record.participants)) return record.participants.length;
  const nested = asRecord(record.group);
  if (nested && Array.isArray(nested.participants)) return nested.participants.length;
  return null;
};

const extractPictureUrl = (raw: unknown): string | null => {
  const record = asRecord(raw);
  if (!record) return null;
  const url =
    asString(record.pictureUrl) ??
    asString(record.picture) ??
    asString(record.profilePicUrl) ??
    asString(asRecord(record.picture)?.url);
  return url ?? null;
};

export const mapWahaGroup = (raw: unknown): NormalizedGroup | null => {
  const id = extractGroupId(raw);
  if (!id) return null;
  return {
    id,
    name: extractGroupName(raw),
    participantCount: extractParticipantCount(raw),
    pictureUrl: extractPictureUrl(raw),
  };
};

const valuesFromJidMap = (record: Record<string, unknown>): unknown[] => {
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!GROUP_ID_REGEX.test(key)) continue;
    values.push(asRecord(value) ? value : { id: key });
  }
  return values;
};

export const isWahaGroupsJidMap = (raw: unknown): boolean => {
  const record = asRecord(raw);
  if (!record) return false;
  return Object.keys(record).some((key) => GROUP_ID_REGEX.test(key));
};

export const unwrapGroupsArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (!record) return [];
  if (Array.isArray(record.groups)) return record.groups;
  if (Array.isArray(record.data)) return record.data;
  const nested = asRecord(record.data);
  if (nested && Array.isArray(nested.groups)) return nested.groups;
  if (Array.isArray(record.chats)) return record.chats;
  return valuesFromJidMap(record);
};

export const mapWahaGroups = (raw: unknown): NormalizedGroup[] => {
  const mapped: NormalizedGroup[] = [];
  for (const item of unwrapGroupsArray(raw)) {
    const group = mapWahaGroup(item);
    if (group) mapped.push(group);
  }
  return mapped;
};

export const describeRawGroupsShape = (
  raw: unknown,
): { kind: string; size: number; jidKeyed: number } => {
  if (Array.isArray(raw)) return { kind: 'array', size: raw.length, jidKeyed: 0 };
  const record = asRecord(raw);
  if (!record) return { kind: typeof raw, size: 0, jidKeyed: 0 };
  const keys = Object.keys(record);
  return {
    kind: 'object',
    size: keys.length,
    jidKeyed: keys.filter((key) => GROUP_ID_REGEX.test(key)).length,
  };
};
