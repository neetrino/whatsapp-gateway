import { Controller, Get, Render, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { baseView, type BaseViewModel } from '../view-helpers';

@Controller('settings')
@Roles(Role.ADMIN)
export class SettingsController {
  @Get()
  @Render('dashboard/settings')
  settings(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ): BaseViewModel & { active: 'settings' } {
    return { ...baseView(req, user, 'Settings'), active: 'settings' };
  }
}
