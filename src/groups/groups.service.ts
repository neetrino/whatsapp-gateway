import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import { loadConnectedAccount } from '../whatsapp-accounts/load-connected-account';
import {
  GROUP_ID_REGEX,
  INVITE_CODE_REGEX,
  WHATSAPP_INVITE_BASE_URL,
} from './constants/group.constants';
import {
  describeRawGroupsShape,
  extractGroupId,
  extractGroupName,
  isWahaGroupsJidMap,
  mapWahaGroup,
  mapWahaGroups,
} from './mappers/waha-group.mapper';
import { extractInviteCode, mapWahaParticipants } from './mappers/waha-participant.mapper';
import { IdempotencyScope } from '../common/db-enums';
import { IdempotencyStore } from '../common/idempotency/idempotency.store';
import { runGroupWrite } from './group-idempotent-write';
import { assertGroupId, mapGroupProviderError } from './groups-errors';
import { dedupeParticipantIds, hashGroupRequestPayload } from './idempotency';
import type {
  AddParticipantsResult,
  CreateGroupResult,
  GroupParticipantsResult,
  GroupsListResult,
  InviteLinkResult,
  NormalizedGroup,
  RefreshGroupsResult,
} from './types/group.types';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
    private readonly wahaService: WahaService,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async listGroups(
    account: ApiAccountContext,
    query: { limit: number; offset: number; search?: string },
  ): Promise<GroupsListResult> {
    const sessionName = await this.sessionOf(account);
    try {
      const raw = await this.wahaClient.listGroups(sessionName, {
        limit: query.limit,
        offset: query.offset,
        sortBy: 'subject',
        sortOrder: 'asc',
        exclude: 'participants',
      });
      let groups = mapWahaGroups(raw);
      if (groups.length === 0) {
        this.logger.warn({ msg: 'waha_groups_mapped_empty', ...describeRawGroupsShape(raw) });
      }
      if (query.search) {
        const needle = query.search.toLowerCase();
        groups = groups.filter(
          (g) => g.name.toLowerCase().includes(needle) || g.id.toLowerCase().includes(needle),
        );
      }
      if (isWahaGroupsJidMap(raw)) {
        groups = groups.slice(query.offset, query.offset + query.limit);
      }
      return {
        groups,
        pagination: { limit: query.limit, offset: query.offset, count: groups.length },
      };
    } catch (error) {
      throw mapGroupProviderError(error, ERROR_CODES.GROUP_LIST_FAILED, 'Failed to list groups.');
    }
  }

  async getGroup(account: ApiAccountContext, groupId: string): Promise<NormalizedGroup> {
    assertGroupId(groupId);
    const sessionName = await this.sessionOf(account);
    try {
      const mapped = mapWahaGroup(await this.wahaClient.getGroup(sessionName, groupId));
      if (!mapped) {
        throw new AppException({
          code: ERROR_CODES.GROUP_NOT_FOUND,
          message: 'WhatsApp group not found.',
          status: 404,
        });
      }
      return mapped;
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw mapGroupProviderError(error, ERROR_CODES.GROUP_LIST_FAILED, 'Failed to get group.');
    }
  }

  async refreshGroups(account: ApiAccountContext): Promise<RefreshGroupsResult> {
    const sessionName = await this.sessionOf(account);
    try {
      await this.wahaClient.refreshGroups(sessionName);
      return { refreshed: true };
    } catch (error) {
      throw mapGroupProviderError(error, ERROR_CODES.GROUP_REFRESH_FAILED, 'Failed to refresh groups.');
    }
  }

  async createGroup(
    account: ApiAccountContext,
    input: { name: string; participants: string[] },
    idempotencyKey: string,
  ): Promise<CreateGroupResult> {
    const participants = dedupeParticipantIds(input.participants);
    const loaded = await loadConnectedAccount(
      this.prisma,
      account.projectId,
      account.whatsappAccountId,
    );
    const sessionName = this.wahaService.effectiveSessionName(loaded);
    return runGroupWrite(
      this.idempotency,
      {
        accountId: loaded.id,
        scope: IdempotencyScope.GROUP_CREATE,
        idempotencyKey,
        requestHash: hashGroupRequestPayload({ name: input.name, participants }),
      },
      async () => {
        try {
          const raw = await this.wahaClient.createGroup(sessionName, {
            name: input.name,
            participants: participants.map((id) => ({ id })),
          });
          const groupId = extractGroupId(raw);
          if (!groupId || !GROUP_ID_REGEX.test(groupId)) {
            throw new AppException({
              code: ERROR_CODES.GROUP_CREATE_INVALID_PROVIDER_RESPONSE,
              message: 'WAHA returned an invalid group create response.',
              status: 502,
            });
          }
          return { id: groupId, name: extractGroupName(raw, input.name) || input.name };
        } catch (error) {
          if (error instanceof AppException || error instanceof WahaTransportError) throw error;
          throw mapGroupProviderError(
            error,
            ERROR_CODES.GROUP_CREATE_FAILED,
            'Failed to create WhatsApp group.',
          );
        }
      },
      {
        code: ERROR_CODES.GROUP_CREATE_OUTCOME_UNKNOWN,
        message:
          'Group create outcome is unknown after a transport failure. Do not retry with a new key; reconcile manually.',
      },
    );
  }

  async listParticipants(
    account: ApiAccountContext,
    groupId: string,
  ): Promise<GroupParticipantsResult> {
    assertGroupId(groupId);
    const sessionName = await this.sessionOf(account);
    try {
      const participants = mapWahaParticipants(
        await this.wahaClient.listGroupParticipants(sessionName, groupId),
      );
      return { groupId, participants, count: participants.length };
    } catch (error) {
      throw mapGroupProviderError(
        error,
        ERROR_CODES.GROUP_PARTICIPANTS_LIST_FAILED,
        'Failed to list group participants.',
      );
    }
  }

  async addParticipants(
    account: ApiAccountContext,
    groupId: string,
    participantsInput: string[],
    idempotencyKey: string,
  ): Promise<AddParticipantsResult> {
    assertGroupId(groupId);
    const participants = dedupeParticipantIds(participantsInput);
    const loaded = await loadConnectedAccount(
      this.prisma,
      account.projectId,
      account.whatsappAccountId,
    );
    const sessionName = this.wahaService.effectiveSessionName(loaded);
    return runGroupWrite(
      this.idempotency,
      {
        accountId: loaded.id,
        scope: IdempotencyScope.GROUP_ADD,
        idempotencyKey,
        requestHash: hashGroupRequestPayload({ groupId, participants }),
      },
      async () => {
        try {
          return await this.executeAddParticipants(sessionName, groupId, participants);
        } catch (error) {
          if (error instanceof WahaTransportError) throw error;
          throw mapGroupProviderError(
            error,
            ERROR_CODES.GROUP_PARTICIPANT_ADD_FAILED,
            'Failed to add group participants.',
          );
        }
      },
      {
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message: 'WAHA service is currently unavailable.',
      },
    );
  }

  async getInviteLink(account: ApiAccountContext, groupId: string): Promise<InviteLinkResult> {
    assertGroupId(groupId);
    const sessionName = await this.sessionOf(account);
    try {
      const code = extractInviteCode(await this.wahaClient.getGroupInviteCode(sessionName, groupId));
      if (!code || !INVITE_CODE_REGEX.test(code)) {
        throw new AppException({
          code: ERROR_CODES.GROUP_INVITE_INVALID_PROVIDER_RESPONSE,
          message: 'WAHA returned an invalid invite code response.',
          status: 502,
        });
      }
      return { groupId, inviteUrl: `${WHATSAPP_INVITE_BASE_URL}/${code}` };
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw mapGroupProviderError(
        error,
        ERROR_CODES.GROUP_INVITE_LINK_FAILED,
        'Failed to get group invite link.',
      );
    }
  }

  private async executeAddParticipants(
    sessionName: string,
    groupId: string,
    participants: string[],
  ): Promise<AddParticipantsResult> {
    const current = mapWahaParticipants(await this.wahaClient.listGroupParticipants(sessionName, groupId));
    const memberIds = new Set(current.filter((p) => p.role !== 'left').map((p) => p.id.toLowerCase()));
    const alreadyMembers: string[] = [];
    const toAdd: string[] = [];
    for (const id of participants) {
      if (memberIds.has(id.toLowerCase())) alreadyMembers.push(id);
      else toAdd.push(id);
    }
    if (toAdd.length === 0) {
      return { groupId, status: 'completed', added: [], alreadyMembers, failed: [] };
    }
    try {
      await this.wahaClient.addGroupParticipants(sessionName, groupId, {
        participants: toAdd.map((id) => ({ id })),
      });
      return { groupId, status: 'completed', added: toAdd, alreadyMembers, failed: [] };
    } catch (error) {
      if (error instanceof WahaApiError) {
        return {
          groupId,
          status: 'partial',
          added: [],
          alreadyMembers,
          failed: toAdd.map((id) => ({
            id,
            code: 'PARTICIPANT_ADD_FAILED',
            message: 'Participant could not be added.',
          })),
        };
      }
      throw error;
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
