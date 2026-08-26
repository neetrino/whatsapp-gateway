import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';

export const BEARER_PATTERN = /^Bearer\s+([A-Za-z0-9_\-.]{8,256})$/;

export const parseBearerToken = (header: string | undefined): string => {
  if (!header) {
    throw new AppException({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Authorization token is required.',
      status: 401,
    });
  }
  const raw = matchBearer(header);
  if (!raw) {
    throw new AppException({
      code: ERROR_CODES.INVALID_TOKEN,
      message: 'Invalid API token.',
      status: 401,
    });
  }
  return raw;
};

export const matchBearer = (header: string): string | undefined => {
  const match = BEARER_PATTERN.exec(header.trim());
  return match?.[1];
};
