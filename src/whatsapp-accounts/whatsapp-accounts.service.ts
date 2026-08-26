import { Injectable } from '@nestjs/common';
import { SessionStatus, WhatsappAccount, WhatsappAccountMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { WahaService } from '../waha/waha.service';
import type { QrViewModel } from '../waha/types/waha.types';
import { generateSessionName } from '../common/utils/session-name';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaService: WahaService,
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

  async listRecentLogs(projectId: string, accountId: string, take = 25) {
    await this.getByIdForProject(projectId, accountId);
    return this.prisma.outboundMessageLog.findMany({
      where: { whatsappAccountId: accountId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        requestId: true,
        messageType: true,
        status: true,
        wahaMessageId: true,
        errorCode: true,
        createdAt: true,
      },
    });
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
