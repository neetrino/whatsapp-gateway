import { Module } from '@nestjs/common';
import { WahaModule } from '../waha/waha.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { WhatsappAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { ProjectApiTokenGuard } from '../common/guards/project-api-token.guard';
import { PhoneRejectionGuard } from '../common/guards/phone-rejection.guard';
import { V1AccountsController } from './v1-accounts.controller';
import { V1MessagesController } from './v1-messages.controller';
import { V1AccountsService } from './v1-accounts.service';
import { V1MessagesService } from './v1-messages.service';
import { V1SendMessagePipe } from './v1-send-message.pipe';

@Module({
  imports: [WahaModule, ApiTokensModule, WhatsappAccountsModule],
  controllers: [V1AccountsController, V1MessagesController],
  providers: [
    V1AccountsService,
    V1MessagesService,
    V1SendMessagePipe,
    ProjectApiTokenGuard,
    PhoneRejectionGuard,
  ],
})
export class V1Module {}
