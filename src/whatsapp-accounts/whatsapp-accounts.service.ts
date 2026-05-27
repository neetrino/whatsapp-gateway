import { Injectable } from '@nestjs/common';
import { Role, SessionStatus, WhatsappAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaService } from '../waha/waha.service';
import type { QrViewModel } from '../waha/types/waha.types';
import { generateSessionName } from '../common/utils/session-name';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface AccountWithUser extends WhatsappAccount {
  user: { id: string; name: string; email: string; role: Role; isActive: boolean };
}

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaService: WahaService,
  ) {}

  async createForUser(userId: string, label: string): Promise<WhatsappAccount> {
    const existing = await this.prisma.whatsappAccount.findUnique({ where: { userId } });
    if (existing) {
      throw new AppException({
        code: ERROR_CODES.CONFLICT,
        message: 'User already has a WhatsApp account.',
        status: 409,
      });
    }
    return this.prisma.whatsappAccount.create({
      data: {
        userId,
        label,
        sessionName: generateSessionName(),
        status: SessionStatus.QR_REQUIRED,
        isActive: true,
      },
    });
  }

  async listAll(): Promise<AccountWithUser[]> {
    return this.prisma.whatsappAccount.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForActor(id: string, actor: AuthenticatedUser): Promise<AccountWithUser> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
    });
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'WhatsApp account not found.',
        status: 404,
      });
    }
    this.assertActorMayAccess(account, actor);
    return account;
  }

  async getOwnByUserId(userId: string): Promise<AccountWithUser> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
    });
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'WhatsApp account not found.',
        status: 404,
      });
    }
    return account;
  }

  async refreshStatus(account: WhatsappAccount): Promise<WhatsappAccount> {
    return this.wahaService.refreshStatus(account);
  }

  async startOrEnsureSession(account: WhatsappAccount): Promise<void> {
    await this.wahaService.startSession(account);
  }

  async restart(account: WhatsappAccount): Promise<void> {
    await this.wahaService.restartSession(account);
  }

  async stopSession(account: WhatsappAccount): Promise<void> {
    await this.wahaService.stopSession(account);
  }

  async unlink(account: WhatsappAccount): Promise<void> {
    await this.wahaService.logoutSession(account);
  }

  async getQrForPage(account: WhatsappAccount, requestId: string): Promise<QrViewModel> {
    return this.wahaService.getQrForDashboard(account, { requestId, accountId: account.id });
  }

  assertActorMayAccess(account: WhatsappAccount, actor: AuthenticatedUser): void {
    if (actor.role === Role.ADMIN) return;
    if (account.userId !== actor.id) {
      throw new AppException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'You may not access this WhatsApp account.',
        status: 403,
      });
    }
  }
}
