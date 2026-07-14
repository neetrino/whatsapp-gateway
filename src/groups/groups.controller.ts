import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccount, ApiAccountContext } from '../common/decorators/api-account.decorator';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';
import { GroupIdParamDto } from './dto/group-id-param.dto';
import { AddGroupParticipantsDto } from './dto/add-group-participants.dto';
import { requireIdempotencyKey } from './idempotency';
import type {
  AddParticipantsResult,
  CreateGroupResult,
  GroupParticipantsResult,
  GroupsListResult,
  InviteLinkResult,
  NormalizedGroup,
  RefreshGroupsResult,
} from './types/group.types';

@Controller('api/groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Public()
  @UseGuards(ApiTokenGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async list(
    @Query() query: ListGroupsQueryDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: GroupsListResult }> {
    const data = await this.groupsService.listGroups(this.requireAccount(account), query);
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async create(
    @Body() dto: CreateGroupDto,
    @Headers() headers: Record<string, unknown>,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: CreateGroupResult }> {
    const idempotencyKey = requireIdempotencyKey(headers);
    const data = await this.groupsService.createGroup(
      this.requireAccount(account),
      { name: dto.name, participants: dto.participants },
      idempotencyKey,
    );
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 1 } })
  async refresh(
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: RefreshGroupsResult }> {
    const data = await this.groupsService.refreshGroups(this.requireAccount(account));
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Get(':groupId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getOne(
    @Param() params: GroupIdParamDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: NormalizedGroup }> {
    const data = await this.groupsService.getGroup(this.requireAccount(account), params.groupId);
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Get(':groupId/participants')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async listParticipants(
    @Param() params: GroupIdParamDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: GroupParticipantsResult }> {
    const data = await this.groupsService.listParticipants(
      this.requireAccount(account),
      params.groupId,
    );
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Post(':groupId/participants')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async addParticipants(
    @Param() params: GroupIdParamDto,
    @Body() dto: AddGroupParticipantsDto,
    @Headers() headers: Record<string, unknown>,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: AddParticipantsResult }> {
    const idempotencyKey = requireIdempotencyKey(headers);
    const data = await this.groupsService.addParticipants(
      this.requireAccount(account),
      params.groupId,
      dto.participants,
      idempotencyKey,
    );
    return { success: true, data };
  }

  @Public()
  @UseGuards(ApiTokenGuard)
  @Get(':groupId/invite-link')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async inviteLink(
    @Param() params: GroupIdParamDto,
    @ApiAccount() account: ApiAccountContext | undefined,
  ): Promise<{ success: true; data: InviteLinkResult }> {
    const data = await this.groupsService.getInviteLink(
      this.requireAccount(account),
      params.groupId,
    );
    return { success: true, data };
  }

  private requireAccount(account: ApiAccountContext | undefined): ApiAccountContext {
    if (!account) {
      throw new AppException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authorization token is required.',
        status: 401,
      });
    }
    return account;
  }
}
