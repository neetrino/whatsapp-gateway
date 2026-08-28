import type { NormalizedParticipant, NormalizedParticipantRole } from '../types/group.types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizeRole = (raw: unknown): NormalizedParticipantRole => {
  if (typeof raw !== 'string') return 'unknown';
  const value = raw.trim().toLowerCase();
  if (value === 'participant' || value === 'member') return 'participant';
  if (value === 'admin') return 'admin';
  if (value === 'superadmin' || value === 'super_admin') return 'superadmin';
  if (value === 'left') return 'left';
  return 'unknown';
};

const deriveRoleFromFlags = (record: Record<string, unknown>): NormalizedParticipantRole => {
  if (record.isSuperAdmin === true || record.superAdmin === true) return 'superadmin';
  if (record.isAdmin === true || record.admin === true) return 'admin';
  return 'participant';
};

const extractPhone = (id: string): string | null => {
  const match = /^(\d+)@c\.us$/i.exec(id);
  return match?.[1] ?? null;
};

export const mapWahaParticipant = (raw: unknown): NormalizedParticipant | null => {
  const record = asRecord(raw);
  if (!record) {
    if (typeof raw === 'string' && raw.includes('@')) {
      const id = raw.trim();
      const role: NormalizedParticipantRole = 'participant';
      return {
        id,
        phone: extractPhone(id),
        role,
        isAdmin: false,
        isSuperAdmin: false,
      };
    }
    return null;
  }

  const id =
    asString(record.id) ??
    asString(record.jid) ??
    asString(record.participant) ??
    asString(record.chatId);
  if (!id) return null;

  let role = normalizeRole(record.role);
  if (role === 'unknown' && (record.isAdmin !== undefined || record.isSuperAdmin !== undefined)) {
    role = deriveRoleFromFlags(record);
  }

  return {
    id,
    phone: extractPhone(id),
    role,
    isAdmin: role === 'admin' || role === 'superadmin',
    isSuperAdmin: role === 'superadmin',
  };
};

export const unwrapParticipantsArray = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (!record) return [];
  if (Array.isArray(record.participants)) return record.participants;
  if (Array.isArray(record.data)) return record.data;
  return [];
};

export const mapWahaParticipants = (raw: unknown): NormalizedParticipant[] => {
  const items = unwrapParticipantsArray(raw);
  const mapped: NormalizedParticipant[] = [];
  for (const item of items) {
    const participant = mapWahaParticipant(item);
    if (participant) mapped.push(participant);
  }
  return mapped;
};

export const extractInviteCode = (raw: unknown): string | null => {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const fromUrl = /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i.exec(trimmed);
    if (fromUrl?.[1]) return fromUrl[1];
    return trimmed;
  }
  const record = asRecord(raw);
  if (!record) return null;
  return (
    asString(record.code) ??
    asString(record.inviteCode) ??
    asString(record.invite) ??
    extractInviteCode(record.data) ??
    null
  );
};
