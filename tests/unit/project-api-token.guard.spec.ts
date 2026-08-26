import { ProjectApiTokenGuard } from '../../src/common/guards/project-api-token.guard';
import { ERROR_CODES } from '../../src/common/errors/error-codes';

const execution = (authorization?: string) => {
  const request: { header: (name: string) => string | undefined; apiProject?: unknown } = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    },
  };
};

describe('ProjectApiTokenGuard', () => {
  it('attaches project context without selecting an account', async () => {
    const apiTokensService = {
      findProjectByRaw: jest.fn().mockResolvedValue({
        apiTokenId: 't1',
        projectId: 'p1',
        projectIsActive: true,
        revoked: false,
      }),
      touchLastUsed: jest.fn(),
    };
    const guard = new ProjectApiTokenGuard(apiTokensService as never);
    const { context, request } = execution('Bearer gw_test_abcdefgh');
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.apiProject).toEqual({ apiTokenId: 't1', projectId: 'p1' });
    expect(request).not.toHaveProperty('apiAccount');
    expect(apiTokensService.findProjectByRaw).toHaveBeenCalled();
  });

  it('rejects an inactive project', async () => {
    const apiTokensService = {
      findProjectByRaw: jest.fn().mockResolvedValue({
        apiTokenId: 't1',
        projectId: 'p1',
        projectIsActive: false,
        revoked: false,
      }),
      touchLastUsed: jest.fn(),
    };
    const guard = new ProjectApiTokenGuard(apiTokensService as never);
    const { context } = execution('Bearer gw_test_abcdefgh');
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      code: ERROR_CODES.PROJECT_INACTIVE,
    });
    expect(apiTokensService.touchLastUsed).not.toHaveBeenCalled();
  });
});
