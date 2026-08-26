import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
} from '../../common/utils/idempotency-key';

/** Canonical group JID accepted by the public Gateway API. */
export const GROUP_ID_REGEX = /^[A-Za-z0-9._-]+@g\.us$/;

/** Canonical participant JID: digits only + @c.us (no phone normalization). */
export const PARTICIPANT_JID_REGEX = /^[0-9]+@c\.us$/;

/** Safe application limit for create/add participant arrays (not a WAHA hard max). */
export const MAX_GROUP_PARTICIPANTS_PER_REQUEST = 50;

export const DEFAULT_GROUPS_LIMIT = 100;
export const MAX_GROUPS_LIMIT = 200;

export { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_REGEX };

export const WHATSAPP_INVITE_BASE_URL = 'https://chat.whatsapp.com';
export const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{8,128}$/;
