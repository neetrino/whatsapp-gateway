import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesMediaService } from './messages-media.service';
import { WahaModule } from '../waha/waha.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { PhoneRejectionGuard } from '../common/guards/phone-rejection.guard';

@Module({
  imports: [WahaModule, ApiTokensModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesMediaService, ApiTokenGuard, PhoneRejectionGuard],
})
export class MessagesModule {}
