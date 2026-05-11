import axios from 'axios';
import { InvalidPublicUrlError, validatePublicHttpsUrl } from '../common/utils/public-url';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

export type GatewayMediaKind = 'IMAGE' | 'VIDEO';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

export const extensionForMediaType = (pathname: string, _kind: GatewayMediaKind): string | null => {
  const lower = pathname.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return null;
  return lower.slice(dot);
};

export const assertExtensionMatches = (pathname: string, kind: GatewayMediaKind): void => {
  const ext = extensionForMediaType(pathname, kind);
  if (ext === null) return;
  const allowed = kind === 'IMAGE' ? IMAGE_EXT : VIDEO_EXT;
  if (!allowed.has(ext)) {
    throw new AppException({
      code: ERROR_CODES.INVALID_MEDIA_URL,
      message: `URL file extension is not allowed for ${kind}.`,
      status: 400,
    });
  }
};

export const mimetypeForImagePath = (pathname: string): string => {
  const ext = extensionForMediaType(pathname, 'IMAGE');
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
};

export const mimetypeForVideoPath = (pathname: string): string => {
  const ext = extensionForMediaType(pathname, 'VIDEO');
  switch (ext) {
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mp4':
    default:
      return 'video/mp4';
  }
};

export const filenameFromUrl = (href: string, fallback: string): string => {
  try {
    const segment = new URL(href).pathname.split('/').pop();
    if (segment && segment.length > 0 && segment !== '/') {
      return decodeURIComponent(segment);
    }
  } catch {
    /* ignore */
  }
  return fallback;
};

export const optionalHeadProbe = async (
  href: string,
  kind: GatewayMediaKind,
  maxBytes: number,
): Promise<void> => {
  try {
    const response = await axios.head(href, {
      timeout: 3_000,
      maxRedirects: 0,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      return;
    }
    const type = response.headers['content-type'];
    if (typeof type === 'string') {
      const prefix = kind === 'IMAGE' ? 'image/' : 'video/';
      if (!type.toLowerCase().startsWith(prefix)) {
        throw new AppException({
          code: ERROR_CODES.INVALID_MEDIA_URL,
          message: `URL did not return expected ${prefix.slice(0, -1)} content type.`,
          status: 400,
        });
      }
    }
    const len = response.headers['content-length'];
    if (typeof len === 'string' && /^\d+$/.test(len)) {
      const n = Number.parseInt(len, 10);
      if (n > maxBytes) {
        throw new AppException({
          code: ERROR_CODES.INVALID_MEDIA_URL,
          message: 'Media file is too large.',
          status: 400,
        });
      }
    }
  } catch (error) {
    if (error instanceof AppException) throw error;
    /* HEAD unsupported or blocked — rely on WAHA */
  }
};

export const validateMediaUrl = async (
  rawUrl: string,
  kind: GatewayMediaKind,
  maxBytes: number,
): Promise<{ href: string }> => {
  try {
    const { href } = await validatePublicHttpsUrl(rawUrl);
    assertExtensionMatches(new URL(href).pathname, kind);
    await optionalHeadProbe(href, kind, maxBytes);
    return { href };
  } catch (error) {
    if (error instanceof AppException) throw error;
    if (error instanceof InvalidPublicUrlError) {
      throw new AppException({
        code: ERROR_CODES.INVALID_MEDIA_URL,
        message: error.message,
        status: 400,
      });
    }
    throw error;
  }
};
