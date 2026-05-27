import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { clearAuthCookies, issueAuthCookies } from './auth.cookie';
import { CSRF_COOKIE_NAME } from '../common/guards/csrf.guard';
import { readSessionJwtFromRequest } from '../common/guards/jwt-cookie.guard';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Get('login')
  async loginPage(@Req() req: Request, @Res() res: Response): Promise<void> {
    const raw = readSessionJwtFromRequest(req);
    if (raw) {
      try {
        this.jwtService.verify(raw);
        res.redirect(HttpStatus.FOUND, '/dashboard');
        return;
      } catch {
        /* show login */
      }
    }
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    res.status(HttpStatus.OK).render('auth/login', {
      title: 'Neetrino Internal Chat Gateway',
      layout: 'auth',
      noindex: true,
      csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
      loginError: undefined as string | undefined,
    });
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      const session = await this.authService.authenticate(dto.email, dto.password);
      issueAuthCookies(res, session.token, this.authService.secureCookies());
      res.redirect(303, '/dashboard');
    } catch (err) {
      if (err instanceof AppException && err.code === ERROR_CODES.UNAUTHORIZED) {
        const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
        res.status(HttpStatus.OK).render('auth/login', {
          title: 'Neetrino Internal Chat Gateway',
          layout: 'auth',
          noindex: true,
          csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
          loginError: err.message,
        });
        return;
      }
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.SEE_OTHER)
  logout(@Res({ passthrough: false }) res: Response): void {
    clearAuthCookies(res, this.authService.secureCookies());
    res.redirect(303, '/login');
  }
}
