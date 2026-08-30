import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaClient } from '../waha/waha.client';
import { WahaService } from '../waha/waha.service';
import { WahaApiError, WahaTransportError } from '../waha/types/waha.types';
import type { ApiAccountContext } from '../common/decorators/api-account.decorator';
import { loadConnectedAccount } from '../whatsapp-accounts/load-connected-account';
import { IdempotencyScope } from '../common/db-enums';
import { IdempotencyStore } from '../common/idempotency/idempotency.store';
import { runGroupWrite } from './group-idempotent-write';
import { assertGroupId, mapGroupProviderError } from './groups-errors';
import { dedupeParticipantIds, hashGroupRequestPayload } from './idempotency';
import { ERROR_CODES } from '../common/errors/error-codes';
import { mapWahaParticipants } from './mappers/waha-participant.mapper';
import type {
  LeaveGroupResult,
  RemoveParticipantsResult,
  RenameGroupResult,
} from './types/group.types';

@Injectable()
export class GroupsMutationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaClient: WahaClient,
    private readonly wahaService: WahaService,
    private readonly idempotency: IdempotencyStore,
  ) {}

  async renameGroup(
    account: ApiAccountContext,
    groupId: string,
    name: string,
    idempotencyKey: string,
  ): Promise<RenameGroupResult> {
    assertGroupId(groupId);
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
        scope: IdempotencyScope.GROUP_RENAME,
        idempotencyKey,
        requestHash: hashGroupRequestPayload({ groupId, name }),
      },
      async () => {
        try {
          await this.wahaClient.setGroupSubject(sessionName, groupId, name);
          return { id: groupId, name };
        } catch (error) {
          if (error instanceof WahaTransportError) throw error;
          throw mapGroupProviderError(
            error,
            ERROR_CODES.GROUP_RENAME_FAILED,
            'Failed to rename WhatsApp group.',
          );
        }
      },
      {
        code: ERROR_CODES.GROUP_RENAME_OUTCOME_UNKNOWN,
        message:
          'Group rename outcome is unknown after a transport failure. Do not retry with a new key; reconcile manually.',
      },
    );
  }

  async removeParticipants(
    account: ApiAccountContext,
    groupId: string,
    participantsInput: string[],
    idempotencyKey: string,
  ): Promise<RemoveParticipantsResult> {
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
        scope: IdempotencyScope.GROUP_REMOVE,
        idempotencyKey,
        requestHash: hashGroupRequestPayload({ groupId, participants }),
      },
      async () => {
        try {
          return await this.executeRemove(sessionName, groupId, participants);
        } catch (error) {
          if (error instanceof WahaTransportError) throw error;
          throw mapGroupProviderError(
            error,
            ERROR_CODES.GROUP_PARTICIPANT_REMOVE_FAILED,
            'Failed to remove group participants.',
          );
        }
      },
      {
        code: ERROR_CODES.WAHA_UNAVAILABLE,
        message: 'WAHA service is currently unavailable.',
      },
    );
  }

  async leaveGroup(
    account: ApiAccountContext,
    groupId: string,
    idempotencyKey: string,
  ): Promise<LeaveGroupResult> {
    assertGroupId(groupId);
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
        scope: IdempotencyScope.GROUP_LEAVE,
        idempotencyKey,
        requestHash: hashGroupRequestPayload({ groupId }),
      },
      async () => {
        try {
          await this.wahaClient.leaveGroup(sessionName, groupId);
          return { groupId, left: true as const };
        } catch (error) {
          if (error instanceof WahaTransportError) throw error;
          throw mapGroupProviderError(
            error,
            ERROR_CODES.GROUP_LEAVE_FAILED,
            'Failed to leave WhatsApp group.',
          );
        }
      },
      {
        code: ERROR_CODES.GROUP_LEAVE_OUTCOME_UNKNOWN,
        message:
          'Group leave outcome is unknown after a transport failure. Do not retry with a new key; reconcile manually.',
      },
    );
  }

  private async executeRemove(
    sessionName: string,
    groupId: string,
    participants: string[],
  ): Promise<RemoveParticipantsResult> {
    const current = mapWahaParticipants(
      await this.wahaClient.listGroupParticipants(sessionName, groupId),
    );
    const memberIds = new Set(
      current.filter((p) => p.role !== 'left').map((p) => p.id.toLowerCase()),
    );
    const alreadyAbsent: string[] = [];
    const toRemove: string[] = [];
    for (const id of participants) {
      if (memberIds.has(id.toLowerCase())) toRemove.push(id);
      else alreadyAbsent.push(id);
    }
    if (toRemove.length === 0) {
      return { groupId, status: 'completed', removed: [], alreadyAbsent, failed: [] };
    }
    try {
      await this.wahaClient.removeGroupParticipants(sessionName, groupId, {
        participants: toRemove.map((id) => ({ id })),
      });
      return { groupId, status: 'completed', removed: toRemove, alreadyAbsent, failed: [] };
    } catch (error) {
      if (error instanceof WahaApiError) {
        return {
          groupId,
          status: 'partial',
          removed: [],
          alreadyAbsent,
          failed: toRemove.map((id) => ({
            id,
            code: 'PARTICIPANT_REMOVE_FAILED',
            message: 'Participant could not be removed.',
          })),
        };
      }
      throw error;
    }
  }
}
