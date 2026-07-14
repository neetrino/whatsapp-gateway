/** Canonical group JID accepted by the public Gateway API. */
export const GROUP_ID_REGEX = /^[A-Za-z0-9._-]+@g\.us$/;

/** Canonical participant JID: digits only + @c.us (no phone normalization). */
export const PARTICIPANT_JID_REGEX = /^[0-9]+@c\.us$/;

/** Safe application limit for create/add participant arrays (not a WAHA hard max). */
export const MAX_GROUP_PARTICIPANTS_PER_REQUEST = 50;

export const DEFAULT_GROUPS_LIMIT = 100;
export const MAX_GROUPS_LIMIT = 200;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;

export const WHATSAPP_INVITE_BASE_URL = 'https://chat.whatsapp.com';
export const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{8,128}$/;
