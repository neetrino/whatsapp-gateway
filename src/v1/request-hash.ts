import { createHash } from 'node:crypto';
import type { V1SendMessageDto } from './dto/send-v1-message.dto';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Omitted and whitespace-only captions hash as the same empty value. */
export const normalizeCaptionForHash = (caption: string | undefined): string | null => {
  if (caption === undefined) return null;
  const trimmed = caption.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const hashV1SendRequest = (input: V1SendMessageDto): string => {
  if (input.type === 'TEXT') {
    return sha256(JSON.stringify({ type: 'TEXT', chatId: input.chatId, text: sha256(input.text) }));
  }
  const caption = normalizeCaptionForHash(input.caption);
  return sha256(
    JSON.stringify({
      type: input.type,
      chatId: input.chatId,
      mediaUrl: sha256(input.mediaUrl),
      caption: caption === null ? null : sha256(caption),
    }),
  );
};
