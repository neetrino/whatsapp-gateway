import { createHash } from 'node:crypto';
import type { ProjectWebhookPayload } from './project-event.types';

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readBool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const chatIdFromPayload = (payload: Record<string, unknown>): string | null => {
  const from = readString(payload.from);
  const to = readString(payload.to);
  if (from?.includes('@')) return from;
  if (to?.includes('@')) return to;
  return null;
};

const truncateText = (value: string, maxLength: number): { text: string; truncated: boolean } => {
  if (value.length <= maxLength) return { text: value, truncated: false };
  return { text: value.slice(0, maxLength), truncated: true };
};

const buildEventId = (
  accountId: string,
  event: string,
  payload: Record<string, unknown>,
): string => {
  const id = readString(payload.id) ?? readString(payload.messageId) ?? 'unknown';
  const ts = readNumber(payload.timestamp) ?? readNumber(payload.status) ?? 0;
  const digest = createHash('sha256')
    .update(`${accountId}:${event}:${id}:${ts}`)
    .digest('hex')
    .slice(0, 32);
  return `evt_${digest}`;
};

const mapMessageReceived = (
  accountId: string,
  payload: Record<string, unknown>,
  maxTextLength: number,
): ProjectWebhookPayload | null => {
  if (readBool(payload.fromMe) === true) return null;
  const chatId = chatIdFromPayload(payload);
  if (!chatId) return null;
  const rawBody = readString(payload.body);
  const bodyPack =
    rawBody === undefined ? { text: null, truncated: false } : truncateText(rawBody, maxTextLength);
  return {
    eventId: buildEventId(accountId, 'message.received', payload),
    accountId,
    type: 'message.received',
    timestamp: new Date((readNumber(payload.timestamp) ?? Date.now() / 1000) * 1000).toISOString(),
    data: {
      messageId: readString(payload.id) ?? null,
      chatId,
      from: readString(payload.from) ?? null,
      body: bodyPack.text,
      bodyTruncated: bodyPack.truncated,
      hasMedia: payload.hasMedia === true,
      mediaType: readString(payload.mimetype) ?? readString(payload.mimeType) ?? null,
    },
  };
};

const mapMessageAck = (
  accountId: string,
  payload: Record<string, unknown>,
): ProjectWebhookPayload | null => {
  const messageId = readString(payload.id);
  if (!messageId) return null;
  return {
    eventId: buildEventId(accountId, 'message.ack', payload),
    accountId,
    type: 'message.ack',
    timestamp: new Date().toISOString(),
    data: {
      messageId,
      chatId: chatIdFromPayload(payload),
      ack: readNumber(payload.ack) ?? null,
      ackName: readString(payload.ackName) ?? null,
      fromMe: readBool(payload.fromMe) ?? null,
    },
  };
};

const mapMessageReaction = (
  accountId: string,
  payload: Record<string, unknown>,
): ProjectWebhookPayload | null => {
  const reaction =
    payload.reaction && typeof payload.reaction === 'object'
      ? (payload.reaction as Record<string, unknown>)
      : null;
  const messageId = reaction ? readString(reaction.messageId) : null;
  if (!messageId) return null;
  return {
    eventId: buildEventId(accountId, 'message.reaction', payload),
    accountId,
    type: 'message.reaction',
    timestamp: new Date((readNumber(payload.timestamp) ?? Date.now() / 1000) * 1000).toISOString(),
    data: {
      messageId,
      chatId: chatIdFromPayload(payload),
      emoji: reaction ? (readString(reaction.text) ?? '') : '',
      from: readString(payload.from) ?? readString(payload.participant) ?? null,
    },
  };
};

const mapMessageEdited = (
  accountId: string,
  payload: Record<string, unknown>,
  maxTextLength: number,
): ProjectWebhookPayload | null => {
  const messageId = readString(payload.id);
  if (!messageId) return null;
  const rawBody = readString(payload.body);
  const bodyPack =
    rawBody === undefined ? { text: null, truncated: false } : truncateText(rawBody, maxTextLength);
  return {
    eventId: buildEventId(accountId, 'message.edited', payload),
    accountId,
    type: 'message.edited',
    timestamp: new Date((readNumber(payload.timestamp) ?? Date.now() / 1000) * 1000).toISOString(),
    data: {
      messageId,
      chatId: chatIdFromPayload(payload),
      body: bodyPack.text,
      bodyTruncated: bodyPack.truncated,
    },
  };
};

const mapMessageRevoked = (
  accountId: string,
  payload: Record<string, unknown>,
): ProjectWebhookPayload | null => {
  const messageId = readString(payload.id) ?? readString(payload.revokedMessageId);
  if (!messageId) return null;
  return {
    eventId: buildEventId(accountId, 'message.revoked', payload),
    accountId,
    type: 'message.revoked',
    timestamp: new Date().toISOString(),
    data: {
      messageId,
      chatId: chatIdFromPayload(payload),
    },
  };
};

const mapSessionStatus = (
  accountId: string,
  payload: Record<string, unknown>,
): ProjectWebhookPayload => ({
  eventId: buildEventId(accountId, 'session.status', payload),
  accountId,
  type: 'session.status',
  timestamp: new Date().toISOString(),
  data: {
    status: readString(payload.status) ?? readString(payload.name) ?? null,
    previous: readString(payload.previous) ?? null,
  },
});

export const mapWahaEventToProjectPayload = (
  accountId: string,
  wahaEvent: string,
  payload: unknown,
  maxTextLength: number,
): ProjectWebhookPayload | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  switch (wahaEvent) {
    case 'message':
      return mapMessageReceived(accountId, record, maxTextLength);
    case 'message.ack':
      return mapMessageAck(accountId, record);
    case 'message.reaction':
      return mapMessageReaction(accountId, record);
    case 'message.edited':
      return mapMessageEdited(accountId, record, maxTextLength);
    case 'message.revoked':
      return mapMessageRevoked(accountId, record);
    case 'session.status':
      return mapSessionStatus(accountId, record);
    default:
      return null;
  }
};
