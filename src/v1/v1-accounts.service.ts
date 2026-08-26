import { Injectable } from '@nestjs/common';
import type { ApiProjectContext } from '../common/decorators/api-project.decorator';
import { WhatsappAccountsService } from '../whatsapp-accounts/whatsapp-accounts.service';
import { toV1AccountPublic, type V1AccountPublic } from '../whatsapp-accounts/account-public';

export interface V1AccountStatus {
  id: string;
  label: string;
  mode: V1AccountPublic['mode'];
  status: V1AccountPublic['status'];
  isActive: boolean;
  phoneNumber: string | null;
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
    const publicAccount = toV1AccountPublic(refreshed);
    return {
      id: publicAccount.id,
      label: publicAccount.label,
      mode: publicAccount.mode,
      status: publicAccount.status,
      isActive: publicAccount.isActive,
      phoneNumber: publicAccount.phoneNumber,
    };
  }
}
