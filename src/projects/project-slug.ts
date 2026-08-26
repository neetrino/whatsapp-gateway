import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['new']);

export const normalizeProjectSlug = (input: string): string => input.trim().toLowerCase();

export const assertValidProjectSlug = (input: string): string => {
  const slug = normalizeProjectSlug(input);
  if (!SLUG_PATTERN.test(slug) || slug.includes('--')) {
    throw new AppException({
      code: ERROR_CODES.VALIDATION_ERROR,
      message:
        'Invalid project slug. Use 2–64 lowercase letters, digits, and hyphens; start with a letter; no consecutive hyphens.',
      status: 400,
    });
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new AppException({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'This project slug is reserved.',
      status: 400,
    });
  }
  return slug;
};
