import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
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
import type { AdminJwtPayload } from './auth.service';
import { JwtService } from '@nestjs/jwt';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Get('login')
  async loginPage(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (await this.hasActiveSession(req)) {
      res.redirect(HttpStatus.FOUND, '/dashboard');
      return;
    }
    this.renderLogin(req, res, undefined);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 900_000, limit: 100 } })
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
        this.renderLogin(req, res, err.message);
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

  private renderLogin(req: Request, res: Response, loginError: string | undefined): void {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    res.status(HttpStatus.OK).render('auth/login', {
      title: 'Neetrino Internal Chat Gateway',
      layout: 'auth',
      noindex: true,
      csrfToken: cookies?.[CSRF_COOKIE_NAME] ?? '',
      loginError,
    });
  }

  private async hasActiveSession(req: Request): Promise<boolean> {
    const raw = readSessionJwtFromRequest(req);
    if (!raw) return false;
    try {
      const payload = this.jwtService.verify<AdminJwtPayload>(raw);
      if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return false;
      await this.authService.loadActiveAdmin(payload.sub, payload.sv);
      return true;
    } catch {
      return false;
    }
  }
}
