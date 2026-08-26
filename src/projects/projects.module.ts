import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectWebhooksService } from './project-webhooks.service';

@Module({
  providers: [ProjectsService, ProjectWebhooksService],
  exports: [ProjectsService, ProjectWebhooksService],
})
export class ProjectsModule {}
