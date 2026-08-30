import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import { loadConnectedAccount } from '../whatsapp-accounts/load-connected-account';
import { ERROR_CODES } from '../common/errors/error-codes';
import { fetchAllWahaGroups } from '../groups/group-catalog';
import { mapGroupProviderError } from '../groups/groups-errors';
import { applyChatSearch, buildChatCatalog, paginateChats } from './chat-catalog';
import type { ChatsListResult } from './chats.types';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
    private readonly wahaService: WahaService,
  ) {}

  async listChats(
    account: ApiAccountContext,
    query: { limit: number; offset: number; search?: string },
  ): Promise<ChatsListResult> {
    const sessionName = await this.sessionOf(account);
    try {
      const { groups, rawShape } = await fetchAllWahaGroups((page) =>
        this.wahaClient.listGroups(sessionName, page),
      );
      if (groups.length === 0) {
        this.logger.warn({ msg: 'waha_groups_mapped_empty', ...rawShape });
      }
      const chatsRaw = await this.loadRecentChats(sessionName);
      const catalog = applyChatSearch(buildChatCatalog(groups, chatsRaw), query.search);
      return paginateChats(catalog, query.limit, query.offset);
    } catch (error) {
      throw mapGroupProviderError(error, ERROR_CODES.CHATS_LIST_FAILED, 'Failed to list chats.');
    }
  }

  private async loadRecentChats(sessionName: string): Promise<unknown> {
    try {
      return await this.wahaClient.listChats(sessionName, {
        limit: 200,
        offset: 0,
        sortBy: 'messageTimestamp',
        sortOrder: 'desc',
      });
    } catch {
      return [];
    }
  }

  private async sessionOf(account: ApiAccountContext): Promise<string> {
    const loaded = await loadConnectedAccount(
      this.prisma,
      account.projectId,
      account.whatsappAccountId,
    );
    return this.wahaService.effectiveSessionName(loaded);
  }
}
