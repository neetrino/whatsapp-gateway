import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { ResetPasswordDto, UpdateUserDto } from '../../users/dto/update-user.dto';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('users')
@Roles(Role.ADMIN)
export class UsersDashboardController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Render('dashboard/users-list')
  async list(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BaseViewModel & { users: unknown; active: 'users' }> {
    const users = await this.usersService.list();
    return { ...baseView(req, user, 'Users'), users, active: 'users' };
  }

  @Get('new')
  @Render('dashboard/users-new')
  newPage(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): BaseViewModel & { active: 'users' } {
    return { ...baseView(req, user, 'New user'), active: 'users' };
  }

  @Post()
  @HttpCode(HttpStatus.SEE_OTHER)
  async create(@Body() dto: CreateUserDto, @Res() res: Response): Promise<void> {
    const created = await this.usersService.createUserWithAccount(dto);
    res.redirect(303, `/users/${created.id}`);
  }

  @Get(':id')
  @Render('dashboard/users-detail')
  async detail(
    @Req() req: Request,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BaseViewModel & { user: unknown; active: 'users' }> {
    const user = await this.usersService.getById(id);
    return { ...baseView(req, actor, 'User'), user, active: 'users' };
  }

  @Post(':id/update')
  @HttpCode(HttpStatus.SEE_OTHER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.usersService.update(id, dto);
    res.redirect(303, `/users/${id}`);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.SEE_OTHER)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto.password);
    res.redirect(303, `/users/${id}`);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.SEE_OTHER)
  async disable(@Param('id') id: string, @Res() res: Response): Promise<void> {
    await this.usersService.disable(id);
    res.redirect(303, `/users/${id}`);
  }
}
