import { randomBytes } from 'node:crypto';

export const generateSessionName = (): string => `wa_${randomBytes(8).toString('hex')}`;
