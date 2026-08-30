import { Module } from '@nestjs/common';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { WahaModule } from '../waha/waha.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [WahaModule, ApiTokensModule],
  controllers: [ChatsController],
  providers: [ChatsService, ApiTokenGuard],
})
export class ChatsModule {}
