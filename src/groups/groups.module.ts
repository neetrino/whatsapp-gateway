import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { WahaModule } from '../waha/waha.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { ApiTokenGuard } from '../common/guards/api-token.guard';

@Module({
  imports: [WahaModule, ApiTokensModule],
  controllers: [GroupsController],
  providers: [GroupsService, ApiTokenGuard],
})
export class GroupsModule {}
