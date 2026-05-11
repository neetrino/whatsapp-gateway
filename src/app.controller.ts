import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root(@Res() res: Response): void {
    res.redirect(302, '/login');
  }
}
