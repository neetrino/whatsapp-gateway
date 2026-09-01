import { Injectable } from '@nestjs/common';
import type { WhatsappAccount } from '@prisma/client';
import { SessionStatus } from '../common/db-enums';
import type { ApiProjectContext } from '../common/decorators/api-project.decorator';
import { WhatsappAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { toV1AccountPublic, type V1AccountPublic } from '../whatsapp-accounts/account-public';
import {
  isQrStillPending,
  toQrUnavailableException,
  toSessionMutationException,
} from './v1-session-errors';

export interface V1AccountStatus {
  id: string;
  label: string;
  mode: V1AccountPublic['mode'];
  status: V1AccountPublic['status'];
  isActive: boolean;
  phoneNumber: string | null;
}

export interface V1AccountQr {
  id: string;
  status: V1AccountPublic['status'];
  phoneNumber: string | null;
  qrDataUrl: string | null;
}

export interface V1AccountPairingCode {
  id: string;
  status: V1AccountPublic['status'];
  phoneNumber: string | null;
  pairingCode: string | null;
}

@Injectable()
export class V1AccountsService {
  constructor(private readonly accountsService: WhatsappAccountsService) {}

  async list(project: ApiProjectContext): Promise<V1AccountPublic[]> {
    const accounts = await this.accountsService.listForProject(project.projectId);
    return accounts.map(toV1AccountPublic);
  }

  async status(project: ApiProjectContext, accountId: string): Promise<V1AccountStatus> {
    const account = await this.accountsService.getByIdForProject(project.projectId, accountId);
    const refreshed = await this.accountsService.refreshStatus(account);
    return this.toStatus(refreshed);
  }

  async getQr(
    project: ApiProjectContext,
    accountId: string,
    requestId: string,
  ): Promise<V1AccountQr> {
    const account = await this.accountsService.getByIdForProject(project.projectId, accountId);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    if (refreshed.status === SessionStatus.CONNECTED) {
      return this.toQr(refreshed, null);
    }
    return this.resolveQr(refreshed, requestId);
  }

  async requestPairingCode(
    project: ApiProjectContext,
    accountId: string,
    phoneNumber: string,
    requestId: string,
  ): Promise<V1AccountPairingCode> {
    const account = await this.accountsService.getByIdForProject(project.projectId, accountId);
    await this.accountsService.startOrEnsureSession(account);
    const refreshed = await this.accountsService.refreshStatus(account);
    if (refreshed.status === SessionStatus.CONNECTED) {
      return this.toPairing(refreshed, null);
    }
    const result = await this.accountsService.requestPairingCode(refreshed, phoneNumber, requestId);
    if (result.code) return this.toPairing(refreshed, result.code);
    if (result.errorCode === 'WAHA_ALREADY_CONNECTED') {
      const connected = await this.accountsService.refreshStatus(account);
      return this.toPairing(connected, null);
    }
    throw toQrUnavailableException(result.errorCode);
  }

  async restart(project: ApiProjectContext, accountId: string): Promise<V1AccountStatus> {
    return this.mutateSession(project, accountId, (account) =>
      this.accountsService.restart(account),
    );
  }

  async logout(project: ApiProjectContext, accountId: string): Promise<V1AccountStatus> {
    return this.mutateSession(project, accountId, (account) =>
      this.accountsService.unlink(account),
    );
  }

  private async resolveQr(account: WhatsappAccount, requestId: string): Promise<V1AccountQr> {
    const qr = await this.accountsService.getQrForPage(account, requestId);
    if (qr.dataUrl) return this.toQr(account, qr.dataUrl);
    if (qr.errorCode === 'WAHA_ALREADY_CONNECTED') {
      const connected = await this.accountsService.refreshStatus(account);
      return this.toQr(connected, null);
    }
    if (isQrStillPending(qr.errorCode, account.status)) {
      return this.toQr(account, null);
    }
    throw toQrUnavailableException(qr.errorCode);
  }

  private async mutateSession(
    project: ApiProjectContext,
    accountId: string,
    action: (account: WhatsappAccount) => Promise<void>,
  ): Promise<V1AccountStatus> {
    const account = await this.accountsService.getByIdForProject(project.projectId, accountId);
    try {
      await action(account);
    } catch (error) {
      throw toSessionMutationException(error);
    }
    const refreshed = await this.accountsService.refreshStatus(account);
    return this.toStatus(refreshed);
  }

  private toStatus(account: WhatsappAccount): V1AccountStatus {
    const publicAccount = toV1AccountPublic(account);
    return {
      id: publicAccount.id,
      label: publicAccount.label,
      mode: publicAccount.mode,
      status: publicAccount.status,
      isActive: publicAccount.isActive,
      phoneNumber: publicAccount.phoneNumber,
    };
  }

  private toQr(account: WhatsappAccount, qrDataUrl: string | null): V1AccountQr {
    const publicAccount = toV1AccountPublic(account);
    return {
      id: publicAccount.id,
      status: publicAccount.status,
      phoneNumber: publicAccount.phoneNumber,
      qrDataUrl,
    };
  }

  private toPairing(account: WhatsappAccount, pairingCode: string | null): V1AccountPairingCode {
    const publicAccount = toV1AccountPublic(account);
    return {
      id: publicAccount.id,
      status: publicAccount.status,
      phoneNumber: publicAccount.phoneNumber,
      pairingCode,
    };
  }
}
