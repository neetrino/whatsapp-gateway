import { Module } from '@nestjs/common';
import { OverviewController } from './controllers/overview.controller';
import { ProjectsDashboardController } from './controllers/projects.controller';
import { ProjectAccountsController } from './controllers/project-accounts.controller';
import { SystemController } from './controllers/system.controller';
import { ProjectsModule } from '../projects/projects.module';
import { WhatsappAccountsModule } from '../whatsapp-accounts/whatsapp-accounts.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [
    ProjectsModule,
    WhatsappAccountsModule,
    ApiTokensModule,
    AuthModule,
    HealthModule,
    WebhooksModule,
  ],
  controllers: [
    OverviewController,
    ProjectsDashboardController,
    ProjectAccountsController,
    SystemController,
  ],
})
export class DashboardModule {}
