import { ApiTokenGuard } from '../../src/common/guards/api-token.guard';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { validResolvedToken } from '../helpers/resolved-token';

const execution = (authorization?: string) => {
  const request: { header: (name: string) => string | undefined; apiAccount?: unknown } = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    },
  };
};

describe('ApiTokenGuard legacy account resolution', () => {
  it('uses the single active account', async () => {
    const apiTokensService = {
      findValidByRaw: jest.fn().mockResolvedValue(validResolvedToken),
      touchLastUsed: jest.fn(),
    };
    const guard = new ApiTokenGuard(apiTokensService as never);
    const { context, request } = execution('Bearer gw_test_abcdefgh');
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.apiAccount).toEqual({
      apiTokenId: 't1',
      projectId: 'p1',
      whatsappAccountId: 'acc1',
      sessionName: 'wa_test',
    });
  });

  it('does not pick an arbitrary account when several are active', async () => {
    const apiTokensService = {
      findValidByRaw: jest.fn().mockResolvedValue({
        ...validResolvedToken,
        activeAccounts: [
          { id: 'acc1', sessionName: 'wa_a' },
          { id: 'acc2', sessionName: 'wa_b' },
        ],
      }),
      touchLastUsed: jest.fn(),
    };
    const guard = new ApiTokenGuard(apiTokensService as never);
    const { context } = execution('Bearer gw_test_abcdefgh');
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      code: ERROR_CODES.PROJECT_ACCOUNT_AMBIGUOUS,
    });
    expect(apiTokensService.touchLastUsed).not.toHaveBeenCalled();
  });
});
