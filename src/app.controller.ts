import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';
import type { Request } from 'express';
import { CSRF_COOKIE_NAME } from './common/guards/csrf.guard';

@Controller()
export class AppController {
  @Public()
  @Get()
  root(@Req() req: Request, @Res() res: Response): void {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    res.status(HttpStatus.OK).render('public/landing', {
      title: 'Neetrino Internal Chat Gateway',
      layout: 'auth',
      noindex: true,
      csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
    });
  }
}
