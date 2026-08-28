import { Injectable } from '@nestjs/common';
import { WhatsappAccount } from '@prisma/client';
import { SessionStatus, WhatsappAccountMode } from '../common/db-enums';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { AccountModePolicyService } from '../waha/account-mode-policy.service';
import { WahaService } from '../waha/waha.service';
import type { QrViewModel } from '../waha/types/waha.types';
import { generateSessionName } from '../common/utils/session-name';

export interface SwitchModeResult {
  account: WhatsappAccount;
  applied: boolean;
}

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaService: WahaService,
    private readonly modePolicy: AccountModePolicyService,
  ) {}

  async createForProject(
    projectId: string,
    label: string,
    mode: WhatsappAccountMode,
  ): Promise<WhatsappAccount> {
    await this.assertProjectExists(projectId);
    return this.prisma.whatsappAccount.create({
      data: {
        projectId,
        label,
        mode,
        sessionName: generateSessionName(),
        status: SessionStatus.QR_REQUIRED,
        isActive: true,
      },
    });
  }

  async listForProject(projectId: string): Promise<WhatsappAccount[]> {
    return this.prisma.whatsappAccount.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForProject(projectId: string, accountId: string): Promise<WhatsappAccount> {
    const account = await this.prisma.whatsappAccount.findFirst({
      where: { id: accountId, projectId },
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

  async setActiveForProject(
    projectId: string,
    accountId: string,
    isActive: boolean,
  ): Promise<WhatsappAccount> {
    const account = await this.getByIdForProject(projectId, accountId);
    return this.prisma.whatsappAccount.update({
      where: { id: account.id },
      data: { isActive },
    });
  }

  async switchModeForProject(
    projectId: string,
    accountId: string,
    mode: WhatsappAccountMode,
  ): Promise<SwitchModeResult> {
    const account = await this.getByIdForProject(projectId, accountId);
    if (account.mode === mode) return { account, applied: true };

    const exists = await this.modePolicy.sessionExists(account.sessionName);
    if (exists) {
      try {
        await this.modePolicy.applySessionConfig(account.sessionName, mode);
      } catch {
        return { account, applied: false };
      }
    }

    const updated = await this.prisma.whatsappAccount.update({
      where: { id: account.id },
      data: { mode },
    });
    return { account: updated, applied: true };
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

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Project not found.',
        status: 404,
      });
    }
  }
}
