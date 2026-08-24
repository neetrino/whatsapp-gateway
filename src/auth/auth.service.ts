import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/utils/password';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { EnvironmentVariables } from '../config/env.validation';
import { cookieSecureFromNodeEnv } from '../common/utils/cookie-secure';
import type { AuthenticatedAdmin } from '../common/decorators/current-admin.decorator';

export interface AdminJwtPayload {
  sub: string;
  sv: number;
}

export interface SignedAdminSession {
  token: string;
  admin: AuthenticatedAdmin;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async authenticate(email: string, password: string): Promise<SignedAdminSession> {
    const normalizedEmail = email.trim().toLowerCase();
    const admin = await this.prisma.admin.findUnique({ where: { email: normalizedEmail } });
    if (!admin || !admin.isActive) {
      throw this.invalidLogin();
    }
    const ok = await verifyPassword(admin.passwordHash, password);
    if (!ok) {
      throw this.invalidLogin();
    }
    const token = await this.jwtService.signAsync({
      sub: admin.id,
      sv: admin.sessionVersion,
    } satisfies AdminJwtPayload);
    return { token, admin: { id: admin.id, email: admin.email } };
  }

  async loadActiveAdmin(id: string, sessionVersion: number): Promise<AuthenticatedAdmin> {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin || !admin.isActive || admin.sessionVersion !== sessionVersion) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Session expired or invalid.',
        status: 401,
      });
    }
    return { id: admin.id, email: admin.email };
  }

  async changePassword(adminId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
  }

  secureCookies(): boolean {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
    return cookieSecureFromNodeEnv(nodeEnv);
  }

  private invalidLogin(): AppException {
    return new AppException({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid email or password.',
      status: 401,
    });
  }
}
