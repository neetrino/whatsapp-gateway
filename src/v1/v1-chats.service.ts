import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation';
import type { ApiProjectContext } from '../common/decorators/api-project.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AccountModePolicyService } from '../waha/account-mode-policy.service';
import { WahaClient } from '../waha/waha.client';
import {
  mapWahaChatsPage,
  mapWahaMessagesPage,
  type V1ChatsPage,
  type V1MessagesPage,
} from '../waha/waha-chats.mapper';
import {
  storeNotReadyException,
  toChatMessagesException,
  toChatsListException,
} from '../waha/waha-chats.errors';
import { assertAccountReady, loadOwnedAccount } from '../whatsapp-accounts/load-connected-account';
import type { ListChatMessagesQueryDto, ListChatsQueryDto } from './dto/list-chats-query.dto';

@Injectable()
export class V1ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WahaClient,
    private readonly modePolicy: AccountModePolicyService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async listChats(
    project: ApiProjectContext,
    accountId: string,
    query: ListChatsQueryDto,
  ): Promise<V1ChatsPage> {
    const account = await this.loadMessengerAccount(project.projectId, accountId);
    const limit = this.pageLimit(query.limit, 'MAX_CHATS_PAGE');
    const offset = query.offset ?? 0;
    await this.assertStoreReady(account.sessionName);
    try {
      const raw = await this.client.listChats(account.sessionName, {
        limit,
        offset,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return mapWahaChatsPage(raw, limit, offset);
    } catch (error) {
      throw toChatsListException(error);
    }
  }

  async listMessages(
    project: ApiProjectContext,
    accountId: string,
    chatId: string,
    query: ListChatMessagesQueryDto,
  ): Promise<V1MessagesPage> {
    const account = await this.loadMessengerAccount(project.projectId, accountId);
    const limit = this.pageLimit(query.limit, 'MAX_MESSAGES_PAGE');
    const offset = query.offset ?? 0;
    await this.assertStoreReady(account.sessionName);
    const maxText = this.configService.get('MAX_TEXT_LENGTH', { infer: true });
    try {
      const raw = await this.client.listChatMessages(account.sessionName, chatId, {
        limit,
        offset,
      });
      return mapWahaMessagesPage(raw, chatId, limit, offset, maxText);
    } catch (error) {
      throw toChatMessagesException(error);
    }
  }

  private async loadMessengerAccount(projectId: string, accountId: string) {
    const account = await loadOwnedAccount(this.prisma, projectId, accountId);
    this.modePolicy.assertMessengerMode(account.mode);
    return assertAccountReady(account);
  }

  private async assertStoreReady(sessionName: string): Promise<void> {
    const enabled = await this.modePolicy.isStoreEnabled(sessionName);
    if (!enabled) throw storeNotReadyException();
  }

  private pageLimit(
    requested: number | undefined,
    key: 'MAX_CHATS_PAGE' | 'MAX_MESSAGES_PAGE',
  ): number {
    const max = this.configService.get(key, { infer: true });
    if (requested === undefined) return max;
    return Math.min(requested, max);
  }
}
