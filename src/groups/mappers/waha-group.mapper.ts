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

export const extractGroupId = (raw: unknown): string | null => {
  const record = asRecord(raw);
  if (!record) {
    if (typeof raw === 'string' && GROUP_ID_REGEX.test(raw.trim())) return raw.trim();
    return null;
  }

  const direct =
    asString(record.id) ??
    asString(record.gid) ??
    asString(record.groupId) ??
    asString(record.chatId);
  if (direct && GROUP_ID_REGEX.test(direct)) return direct;

  const nested = asRecord(record.group) ?? asRecord(record.groupMetadata);
  if (nested) {
    const nestedId = asString(nested.id) ?? asString(nested.gid);
    if (nestedId && GROUP_ID_REGEX.test(nestedId)) return nestedId;
  }

  return null;
};

export const extractGroupName = (raw: unknown, fallback = ''): string => {
  const record = asRecord(raw);
  if (!record) return fallback;
  return (
    asString(record.subject) ??
    asString(record.name) ??
    asString(record.title) ??
    asString(asRecord(record.group)?.subject) ??
    asString(asRecord(record.group)?.name) ??
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

export const unwrapGroupsArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (!record) return [];
  if (Array.isArray(record.groups)) return record.groups;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.chats)) return record.chats;
  return [];
};

export const mapWahaGroups = (raw: unknown): NormalizedGroup[] => {
  const items = unwrapGroupsArray(raw);
  const mapped: NormalizedGroup[] = [];
  for (const item of items) {
    const group = mapWahaGroup(item);
    if (group) mapped.push(group);
  }
  return mapped;
};
