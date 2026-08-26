import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import type { ResolvedProjectToken } from '../../api-tokens/api-tokens.service';

export interface ProjectAuthContext {
  apiTokenId: string;
  projectId: string;
}

export const assertProjectToken = (found: ResolvedProjectToken | null): ProjectAuthContext => {
  if (!found) {
    throw new AppException({
      code: ERROR_CODES.INVALID_TOKEN,
      message: 'Invalid API token.',
      status: 401,
    });
  }
  if (found.revoked) {
    throw new AppException({
      code: ERROR_CODES.TOKEN_REVOKED,
      message: 'API token has been revoked.',
      status: 403,
    });
  }
  if (!found.projectIsActive) {
    throw new AppException({
      code: ERROR_CODES.PROJECT_INACTIVE,
      message: 'Project is inactive.',
      status: 403,
    });
  }
  return { apiTokenId: found.apiTokenId, projectId: found.projectId };
};
