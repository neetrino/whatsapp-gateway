import { hashApiToken } from './tokens';
import { matchBearer } from './bearer-token';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readAuthorization = (req: Record<string, unknown>): string | undefined => {
  const headers = isRecord(req.headers) ? req.headers : undefined;
  const raw = headers?.authorization ?? headers?.Authorization;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
};

export const rateLimitTrackerKey = (req: unknown, pepper: string): string => {
  const record = isRecord(req) ? req : {};
  const header = readAuthorization(record);
  if (header) {
    const raw = matchBearer(header);
    if (raw) return `token:${hashApiToken(raw, pepper)}`;
  }
  const ip = typeof record.ip === 'string' && record.ip.length > 0 ? record.ip : 'unknown';
  return `ip:${ip}`;
};

export const isV1SendPath = (path: string, method: string): boolean =>
  method === 'POST' && /^\/api\/v1\/accounts\/[^/]+\/messages\/?$/.test(path);

export const isV1ReadPath = (path: string, method: string): boolean => {
  if (method !== 'GET') return false;
  if (path === '/api/v1/accounts') return true;
  if (/^\/api\/v1\/accounts\/[^/]+\/status\/?$/.test(path)) return true;
  if (/^\/api\/v1\/accounts\/[^/]+\/chats\/?$/.test(path)) return true;
  if (/^\/api\/v1\/accounts\/[^/]+\/chats\/[^/]+\/messages\/?$/.test(path)) return true;
  return false;
};

export const classifyV1Throttle = (path: string, method: string): 'send' | 'read' | undefined => {
  if (isV1SendPath(path, method)) return 'send';
  if (isV1ReadPath(path, method)) return 'read';
  return undefined;
};

export const requestPath = (req: unknown): { path: string; method: string } => {
  const record = isRecord(req) ? req : {};
  const original = typeof record.originalUrl === 'string' ? record.originalUrl : '';
  const url = typeof record.url === 'string' ? record.url : '';
  const expressPath = typeof record.path === 'string' ? record.path : '';
  const raw = original || url || expressPath;
  const path = (raw.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  const method = typeof record.method === 'string' ? record.method.toUpperCase() : 'GET';
  return { path, method };
};
