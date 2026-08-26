import type { Request } from 'express';
import { CSRF_COOKIE_NAME } from '../common/guards/csrf.guard';
import type { AuthenticatedAdmin } from '../common/decorators/current-admin.decorator';

export interface BaseViewModel {
  layout: 'main';
  title: string;
  csrfToken: string;
  currentAdmin: AuthenticatedAdmin;
  flash?: string;
}

export const baseView = (
  req: Request,
  currentAdmin: AuthenticatedAdmin,
  title: string,
): BaseViewModel => {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return {
    layout: 'main',
    title,
    csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
    currentAdmin,
  };
};
