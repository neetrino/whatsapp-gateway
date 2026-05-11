import { Module } from '@nestjs/common';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { WahaModule } from '../waha/waha.module';

@Module({
  imports: [WahaModule],
  providers: [WhatsappAccountsService],
  exports: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
