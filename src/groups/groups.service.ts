import { Injectable, Logger } from '@nestjs/common';
import {
  GroupApiOperationStatus,
  GroupApiOperationType,
  Prisma,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import {
  GROUP_ID_REGEX,
  INVITE_CODE_REGEX,
  WHATSAPP_INVITE_BASE_URL,
} from './constants/group.constants';
import {
  extractGroupId,
  extractGroupName,
  mapWahaGroup,
  mapWahaGroups,
} from './mappers/waha-group.mapper';
import { extractInviteCode, mapWahaParticipants } from './mappers/waha-participant.mapper';
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
  ) {}

  async listGroups(
    account: ApiAccountContext,
    query: { limit: number; offset: number; search?: string },
  ): Promise<GroupsListResult> {
    const { sessionName } = await this.loadConnectedSession(account.whatsappAccountId);
    try {
      const raw = await this.wahaClient.listGroups(sessionName, {
        limit: query.limit,
        offset: query.offset,
        sortBy: 'subject',
        sortOrder: 'asc',
        exclude: 'participants',
      });
      let groups = mapWahaGroups(raw);
      if (query.search) {
        const needle = query.search.toLowerCase();
        groups = groups.filter(
          (g) => g.name.toLowerCase().includes(needle) || g.id.toLowerCase().includes(needle),
        );
      }
      return {
        groups,
        pagination: { limit: query.limit, offset: query.offset, count: groups.length },
      };
    } catch (error) {
      throw this.mapProviderError(error, ERROR_CODES.GROUP_LIST_FAILED, 'Failed to list groups.');
    }
  }

  async getGroup(account: ApiAccountContext, groupId: string): Promise<NormalizedGroup> {
    this.assertGroupId(groupId);
    const { sessionName } = await this.loadConnectedSession(account.whatsappAccountId);
    try {
      const raw = await this.wahaClient.getGroup(sessionName, groupId);
      const mapped = mapWahaGroup(raw);
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
      if (error instanceof WahaApiError && error.status === 404) {
        throw new AppException({
          code: ERROR_CODES.GROUP_NOT_FOUND,
          message: 'WhatsApp group not found.',
          status: 404,
        });
      }
      throw this.mapProviderError(error, ERROR_CODES.GROUP_LIST_FAILED, 'Failed to get group.');
    }
  }

  async refreshGroups(account: ApiAccountContext): Promise<RefreshGroupsResult> {
    const { sessionName, accountId } = await this.loadConnectedSession(account.whatsappAccountId);
    try {
      await this.wahaClient.refreshGroups(sessionName);
      this.logger.log({
        msg: 'groups_refresh',
        whatsappAccountId: accountId,
        status: 'ok',
      });
      return { refreshed: true };
    } catch (error) {
      throw this.mapProviderError(
        error,
        ERROR_CODES.GROUP_REFRESH_FAILED,
        'Failed to refresh groups.',
      );
    }
  }

  async createGroup(
    account: ApiAccountContext,
    input: { name: string; participants: string[] },
    idempotencyKey: string,
  ): Promise<CreateGroupResult> {
    const participants = dedupeParticipantIds(input.participants);
    const requestHash = hashGroupRequestPayload({
      name: input.name,
      participants,
    });
    const { sessionName, accountId } = await this.loadConnectedSession(account.whatsappAccountId);

    const existing = await this.prisma.groupApiOperation.findUnique({
      where: {
        whatsappAccountId_idempotencyKey: {
          whatsappAccountId: accountId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.resolveCreateIdempotency(existing, requestHash);
    }

    let operation;
    try {
      operation = await this.prisma.groupApiOperation.create({
        data: {
          whatsappAccountId: accountId,
          operationType: GroupApiOperationType.CREATE_GROUP,
          idempotencyKey,
          requestHash,
          status: GroupApiOperationStatus.PROCESSING,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.groupApiOperation.findUnique({
          where: {
            whatsappAccountId_idempotencyKey: {
              whatsappAccountId: accountId,
              idempotencyKey,
            },
          },
        });
        if (raced) return this.resolveCreateIdempotency(raced, requestHash);
      }
      throw error;
    }

    try {
      const raw = await this.wahaClient.createGroup(sessionName, {
        name: input.name,
        participants: participants.map((id) => ({ id })),
      });
      const groupId = extractGroupId(raw);
      if (!groupId || !GROUP_ID_REGEX.test(groupId)) {
        await this.markFailed(operation.id, ERROR_CODES.GROUP_CREATE_INVALID_PROVIDER_RESPONSE);
        this.logger.warn({
          msg: 'group_create_invalid_provider_response',
          whatsappAccountId: accountId,
          operationId: operation.id,
        });
        throw new AppException({
          code: ERROR_CODES.GROUP_CREATE_INVALID_PROVIDER_RESPONSE,
          message: 'WAHA returned an invalid group create response.',
          status: 502,
        });
      }
      const result: CreateGroupResult = {
        id: groupId,
        name: extractGroupName(raw, input.name) || input.name,
      };
      await this.prisma.groupApiOperation.update({
        where: { id: operation.id },
        data: {
          status: GroupApiOperationStatus.SUCCEEDED,
          groupId,
          normalizedResponse: result as unknown as Prisma.InputJsonValue,
          errorCode: null,
        },
      });
      this.logger.log({
        msg: 'group_create',
        whatsappAccountId: accountId,
        groupId,
        participantCount: participants.length,
        status: 'succeeded',
      });
      return result;
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (error instanceof WahaTransportError) {
        await this.prisma.groupApiOperation.update({
          where: { id: operation.id },
          data: {
            status: GroupApiOperationStatus.OUTCOME_UNKNOWN,
            errorCode: ERROR_CODES.GROUP_CREATE_OUTCOME_UNKNOWN,
          },
        });
        this.logger.warn({
          msg: 'group_create_outcome_unknown',
          whatsappAccountId: accountId,
          operationId: operation.id,
        });
        throw new AppException({
          code: ERROR_CODES.GROUP_CREATE_OUTCOME_UNKNOWN,
          message:
            'Group create outcome is unknown after a transport failure. Do not retry with a new key; reconcile manually.',
          status: 503,
        });
      }
      await this.markFailed(operation.id, ERROR_CODES.GROUP_CREATE_FAILED);
      throw this.mapProviderError(
        error,
        ERROR_CODES.GROUP_CREATE_FAILED,
        'Failed to create WhatsApp group.',
      );
    }
  }

  async listParticipants(
    account: ApiAccountContext,
    groupId: string,
  ): Promise<GroupParticipantsResult> {
    this.assertGroupId(groupId);
    const { sessionName } = await this.loadConnectedSession(account.whatsappAccountId);
    try {
      const raw = await this.wahaClient.listGroupParticipants(sessionName, groupId);
      const participants = mapWahaParticipants(raw);
      return { groupId, participants, count: participants.length };
    } catch (error) {
      if (error instanceof WahaApiError && error.status === 404) {
        throw new AppException({
          code: ERROR_CODES.GROUP_NOT_FOUND,
          message: 'WhatsApp group not found.',
          status: 404,
        });
      }
      throw this.mapProviderError(
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
    this.assertGroupId(groupId);
    const participants = dedupeParticipantIds(participantsInput);
    const requestHash = hashGroupRequestPayload({ groupId, participants });
    const { sessionName, accountId } = await this.loadConnectedSession(account.whatsappAccountId);

    const existing = await this.prisma.groupApiOperation.findUnique({
      where: {
        whatsappAccountId_idempotencyKey: {
          whatsappAccountId: accountId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return this.resolveAddIdempotency(existing, requestHash, account, groupId, participants);
    }

    let operation;
    try {
      operation = await this.prisma.groupApiOperation.create({
        data: {
          whatsappAccountId: accountId,
          operationType: GroupApiOperationType.ADD_PARTICIPANTS,
          idempotencyKey,
          requestHash,
          status: GroupApiOperationStatus.PROCESSING,
          groupId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.groupApiOperation.findUnique({
          where: {
            whatsappAccountId_idempotencyKey: {
              whatsappAccountId: accountId,
              idempotencyKey,
            },
          },
        });
        if (raced) {
          return this.resolveAddIdempotency(raced, requestHash, account, groupId, participants);
        }
      }
      throw error;
    }

    try {
      const result = await this.executeAddParticipants(sessionName, groupId, participants);
      await this.prisma.groupApiOperation.update({
        where: { id: operation.id },
        data: {
          status:
            result.status === 'completed'
              ? GroupApiOperationStatus.SUCCEEDED
              : GroupApiOperationStatus.FAILED,
          groupId,
          normalizedResponse: result as unknown as Prisma.InputJsonValue,
          errorCode: result.status === 'partial' ? ERROR_CODES.GROUP_PARTICIPANT_ADD_PARTIAL : null,
        },
      });
      this.logger.log({
        msg: 'group_participants_add',
        whatsappAccountId: accountId,
        groupId,
        participantCount: participants.length,
        addedCount: result.added.length,
        alreadyMembersCount: result.alreadyMembers.length,
        failedCount: result.failed.length,
        status: result.status,
      });
      return result;
    } catch (error) {
      if (error instanceof AppException) {
        await this.markFailed(operation.id, error.code);
        throw error;
      }
      if (error instanceof WahaTransportError) {
        await this.prisma.groupApiOperation.update({
          where: { id: operation.id },
          data: {
            status: GroupApiOperationStatus.OUTCOME_UNKNOWN,
            errorCode: ERROR_CODES.WAHA_UNAVAILABLE,
          },
        });
        throw new AppException({
          code: ERROR_CODES.WAHA_UNAVAILABLE,
          message: 'WAHA service is currently unavailable.',
          status: 503,
        });
      }
      await this.markFailed(operation.id, ERROR_CODES.GROUP_PARTICIPANT_ADD_FAILED);
      throw this.mapProviderError(
        error,
        ERROR_CODES.GROUP_PARTICIPANT_ADD_FAILED,
        'Failed to add group participants.',
      );
    }
  }

  async getInviteLink(account: ApiAccountContext, groupId: string): Promise<InviteLinkResult> {
    this.assertGroupId(groupId);
    const { sessionName, accountId } = await this.loadConnectedSession(account.whatsappAccountId);
    try {
      const raw = await this.wahaClient.getGroupInviteCode(sessionName, groupId);
      const code = extractInviteCode(raw);
      if (!code || !INVITE_CODE_REGEX.test(code)) {
        this.logger.warn({
          msg: 'group_invite_invalid_provider_response',
          whatsappAccountId: accountId,
          groupId,
        });
        throw new AppException({
          code: ERROR_CODES.GROUP_INVITE_INVALID_PROVIDER_RESPONSE,
          message: 'WAHA returned an invalid invite code response.',
          status: 502,
        });
      }
      this.logger.log({
        msg: 'group_invite_link',
        whatsappAccountId: accountId,
        groupId,
        status: 'ok',
      });
      return {
        groupId,
        inviteUrl: `${WHATSAPP_INVITE_BASE_URL}/${code}`,
      };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (error instanceof WahaApiError && error.status === 404) {
        throw new AppException({
          code: ERROR_CODES.GROUP_NOT_FOUND,
          message: 'WhatsApp group not found.',
          status: 404,
        });
      }
      throw this.mapProviderError(
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
    const current = mapWahaParticipants(
      await this.wahaClient.listGroupParticipants(sessionName, groupId),
    );
    const memberIds = new Set(
      current.filter((p) => p.role !== 'left').map((p) => p.id.toLowerCase()),
    );
    const alreadyMembers: string[] = [];
    const toAdd: string[] = [];
    for (const id of participants) {
      if (memberIds.has(id.toLowerCase())) alreadyMembers.push(id);
      else toAdd.push(id);
    }

    if (toAdd.length === 0) {
      return {
        groupId,
        status: 'completed',
        added: [],
        alreadyMembers,
        failed: [],
      };
    }

    try {
      await this.wahaClient.addGroupParticipants(sessionName, groupId, {
        participants: toAdd.map((id) => ({ id })),
      });
      return {
        groupId,
        status: 'completed',
        added: toAdd,
        alreadyMembers,
        failed: [],
      };
    } catch (error) {
      if (error instanceof WahaApiError) {
        // WAHA commonly returns operation-level failure without reliable per-id mapping.
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

  private resolveCreateIdempotency(
    existing: {
      requestHash: string;
      status: GroupApiOperationStatus;
      normalizedResponse: Prisma.JsonValue | null;
      errorCode: string | null;
    },
    requestHash: string,
  ): CreateGroupResult {
    if (existing.requestHash !== requestHash) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key was already used with a different request body.',
        status: 409,
      });
    }
    if (existing.status === GroupApiOperationStatus.PROCESSING) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS,
        message: 'An identical group operation is already in progress.',
        status: 409,
      });
    }
    if (existing.status === GroupApiOperationStatus.OUTCOME_UNKNOWN) {
      throw new AppException({
        code: ERROR_CODES.GROUP_CREATE_OUTCOME_UNKNOWN,
        message:
          'Previous create outcome is unknown. Do not retry create; reconcile manually before issuing a new key.',
        status: 503,
      });
    }
    if (existing.status === GroupApiOperationStatus.FAILED) {
      throw new AppException({
        code:
          (existing.errorCode as typeof ERROR_CODES.GROUP_CREATE_FAILED) ||
          ERROR_CODES.GROUP_CREATE_FAILED,
        message: 'Previous create group operation failed.',
        status: 502,
      });
    }
    return existing.normalizedResponse as unknown as CreateGroupResult;
  }

  private async resolveAddIdempotency(
    existing: {
      id: string;
      requestHash: string;
      status: GroupApiOperationStatus;
      normalizedResponse: Prisma.JsonValue | null;
      errorCode: string | null;
    },
    requestHash: string,
    account: ApiAccountContext,
    groupId: string,
    participants: string[],
  ): Promise<AddParticipantsResult> {
    if (existing.requestHash !== requestHash) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: 'Idempotency-Key was already used with a different request body.',
        status: 409,
      });
    }
    if (existing.status === GroupApiOperationStatus.PROCESSING) {
      throw new AppException({
        code: ERROR_CODES.IDEMPOTENT_OPERATION_IN_PROGRESS,
        message: 'An identical group operation is already in progress.',
        status: 409,
      });
    }
    if (existing.status === GroupApiOperationStatus.SUCCEEDED && existing.normalizedResponse) {
      return existing.normalizedResponse as unknown as AddParticipantsResult;
    }
    if (existing.status === GroupApiOperationStatus.OUTCOME_UNKNOWN) {
      const membership = await this.listParticipants(account, groupId);
      const memberIds = new Set(
        membership.participants.filter((p) => p.role !== 'left').map((p) => p.id.toLowerCase()),
      );
      const allMembers = participants.every((id) => memberIds.has(id.toLowerCase()));
      if (allMembers) {
        const result: AddParticipantsResult = {
          groupId,
          status: 'completed',
          added: [],
          alreadyMembers: participants,
          failed: [],
        };
        await this.prisma.groupApiOperation.update({
          where: { id: existing.id },
          data: {
            status: GroupApiOperationStatus.SUCCEEDED,
            normalizedResponse: result as unknown as Prisma.InputJsonValue,
            errorCode: null,
          },
        });
        return result;
      }
      throw new AppException({
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message:
          'Previous add-participants outcome is unknown and not all participants are members yet.',
        status: 503,
      });
    }
    if (existing.normalizedResponse) {
      return existing.normalizedResponse as unknown as AddParticipantsResult;
    }
    throw new AppException({
      code: ERROR_CODES.GROUP_PARTICIPANT_ADD_FAILED,
      message: 'Previous add-participants operation failed.',
      status: 502,
    });
  }

  private async loadConnectedSession(
    whatsappAccountId: string,
  ): Promise<{ accountId: string; sessionName: string }> {
    const account = await this.prisma.whatsappAccount.findUnique({
      where: { id: whatsappAccountId },
      select: { id: true, sessionName: true, isActive: true, status: true },
    });
    if (!account || !account.isActive || account.status !== SessionStatus.CONNECTED) {
      throw new AppException({
        code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
        message: 'WhatsApp account is not connected. Please scan QR code in Gateway dashboard.',
        status: 409,
      });
    }
    return {
      accountId: account.id,
      sessionName: this.wahaService.effectiveSessionName(account),
    };
  }

  private assertGroupId(groupId: string): void {
    if (!GROUP_ID_REGEX.test(groupId)) {
      throw new AppException({
        code: ERROR_CODES.INVALID_GROUP_ID,
        message: 'Invalid groupId format. Expected WhatsApp group id ending with @g.us.',
        status: 400,
      });
    }
  }

  private async markFailed(operationId: string, errorCode: string): Promise<void> {
    await this.prisma.groupApiOperation
      .update({
        where: { id: operationId },
        data: { status: GroupApiOperationStatus.FAILED, errorCode },
      })
      .catch(() => undefined);
  }

  private mapProviderError(error: unknown, code: string, message: string): AppException {
    if (error instanceof AppException) return error;
    if (error instanceof WahaTransportError) {
      return new AppException({
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message: 'WAHA service is currently unavailable.',
        status: 503,
      });
    }
    if (error instanceof WahaApiError && error.status === 404) {
      return new AppException({
        code: ERROR_CODES.GROUP_NOT_FOUND,
        message: 'WhatsApp group not found.',
        status: 404,
      });
    }
    this.logger.warn({
      msg: 'group_provider_error',
      code,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return new AppException({
      code: code as typeof ERROR_CODES.GROUP_LIST_FAILED,
      message,
      status: 502,
    });
  }
}
