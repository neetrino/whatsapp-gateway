import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/utils/password';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { EnvironmentVariables } from '../config/env.validation';
import { cookieSecureFromNodeEnv } from '../common/utils/cookie-secure';

export interface SignedSession {
  token: string;
  user: { id: string; email: string; role: Role; name: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async authenticate(email: string, password: string): Promise<SignedSession> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid email or password.',
        status: 401,
      });
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid email or password.',
        status: 401,
      });
    }
    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    return {
      token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /** `secure` cookies only when NODE_ENV is production (use NODE_ENV=development locally over HTTP). */
  secureCookies(): boolean {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
    return cookieSecureFromNodeEnv(nodeEnv);
  }
}
