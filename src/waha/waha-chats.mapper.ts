export interface V1ChatPublic {
  id: string;
  name: string | null;
  lastMessageAt: string | null;
  unreadCount: number | null;
}

export interface V1MessagePublic {
  id: string;
  chatId: string;
  timestamp: string;
  fromMe: boolean;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'unknown';
  body: string | null;
  bodyTruncated: boolean;
  hasMedia: boolean;
  mediaType: string | null;
  ack: string | null;
}

export interface V1ChatsPage {
  items: V1ChatPublic[];
  limit: number;
  offset: number;
}

export interface V1MessagesPage {
  items: V1MessagePublic[];
  limit: number;
  offset: number;
}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const unwrapWahaList = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: unknown[] }).data;
  }
  return [];
};

const inferMediaType = (record: Record<string, unknown>): string | null => {
  const mimetype = readString(record.mimetype) ?? readString(record.mimeType);
  if (mimetype) return mimetype;
  const media = record.media;
  if (media && typeof media === 'object') {
    return readString((media as { mimetype?: unknown }).mimetype) ?? null;
  }
  return null;
};

const inferMessageType = (
  record: Record<string, unknown>,
  hasMedia: boolean,
  body: string | null,
): V1MessagePublic['type'] => {
  if (!hasMedia) return body ? 'text' : 'unknown';
  const mimetype = inferMediaType(record)?.toLowerCase() ?? '';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype) return 'document';
  return 'unknown';
};

const truncateBody = (
  body: string,
  maxLength: number,
): { body: string; bodyTruncated: boolean } => {
  if (body.length <= maxLength) return { body, bodyTruncated: false };
  return { body: body.slice(0, maxLength), bodyTruncated: true };
};

export const mapWahaChat = (raw: unknown): V1ChatPublic | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = readString(record.id);
  if (!id) return null;
  const lastMessage = record.lastMessage;
  const ts =
    lastMessage && typeof lastMessage === 'object'
      ? readNumber((lastMessage as { timestamp?: unknown }).timestamp)
      : readNumber(record.timestamp);
  return {
    id,
    name: readString(record.name) ?? null,
    lastMessageAt: ts ? new Date(ts * 1000).toISOString() : null,
    unreadCount: readNumber(record.unreadCount) ?? null,
  };
};

export const mapWahaMessage = (
  raw: unknown,
  chatId: string,
  maxTextLength: number,
): V1MessagePublic | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = readString(record.id);
  const timestamp = readNumber(record.timestamp);
  if (!id || !timestamp) return null;
  const hasMedia = record.hasMedia === true;
  const rawBody = readString(record.body) ?? null;
  const bodyPack =
    rawBody === null ? { body: null, bodyTruncated: false } : truncateBody(rawBody, maxTextLength);
  return {
    id,
    chatId,
    timestamp: new Date(timestamp * 1000).toISOString(),
    fromMe: record.fromMe === true,
    type: inferMessageType(record, hasMedia, bodyPack.body),
    body: bodyPack.body,
    bodyTruncated: bodyPack.bodyTruncated,
    hasMedia,
    mediaType: hasMedia ? inferMediaType(record) : null,
    ack: readString(record.ackName) ?? (readNumber(record.ack) !== undefined ? String(record.ack) : null),
  };
};

export const mapWahaChatsPage = (
  raw: unknown,
  limit: number,
  offset: number,
): V1ChatsPage => ({
  items: unwrapWahaList(raw)
    .map((item) => mapWahaChat(item))
    .filter((item): item is V1ChatPublic => item !== null),
  limit,
  offset,
});

export const mapWahaMessagesPage = (
  raw: unknown,
  chatId: string,
  limit: number,
  offset: number,
  maxTextLength: number,
): V1MessagesPage => ({
  items: unwrapWahaList(raw)
    .map((item) => mapWahaMessage(item, chatId, maxTextLength))
    .filter((item): item is V1MessagePublic => item !== null),
  limit,
  offset,
});
