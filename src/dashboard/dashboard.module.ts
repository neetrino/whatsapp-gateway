import { Module } from '@nestjs/common';
import { OverviewController } from './controllers/overview.controller';
import { UsersDashboardController } from './controllers/users.controller';
import { AccountsDashboardController } from './controllers/accounts.controller';
import { TokensDashboardController } from './controllers/tokens.controller';
import { MyAccountController } from './controllers/my-account.controller';
import { SettingsController } from './controllers/settings.controller';
import { UsersModule } from '../users/users.module';
import { WhatsappAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [UsersModule, WhatsappAccountsModule, ApiTokensModule, AuthModule, HealthModule],
  controllers: [
    OverviewController,
    UsersDashboardController,
    AccountsDashboardController,
    TokensDashboardController,
    MyAccountController,
    SettingsController,
  ],
})
export class DashboardModule {}
