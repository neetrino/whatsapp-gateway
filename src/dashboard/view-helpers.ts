import type { Request } from 'express';
import { CSRF_COOKIE_NAME } from '../common/guards/csrf.guard';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface BaseViewModel {
  layout: 'main';
  title: string;
  csrfToken: string;
  currentUser: AuthenticatedUser;
  flash?: string;
}

export const baseView = (
  req: Request,
  currentUser: AuthenticatedUser,
  title: string,
): BaseViewModel => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return {
    layout: 'main',
    title,
    csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
    currentUser,
  };
};
