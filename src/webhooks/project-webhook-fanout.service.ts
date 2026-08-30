import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation';
import { validatePublicHttpsUrl } from '../common/utils/public-url';
import { PrismaService } from '../prisma/prisma.service';
import type { ProjectWebhookPayload } from './project-event.types';
import { postProjectWebhook } from './project-webhook-post';
import { serializeProjectWebhookPayload } from './webhook-payload';

@Injectable()
export class ProjectWebhookFanoutService {
  private readonly logger = new Logger(ProjectWebhookFanoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async deliver(projectId: string, payload: ProjectWebhookPayload): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        isActive: true,
        webhookEnabled: true,
        webhookUrl: true,
        webhookSecretHash: true,
      },
    });
    if (
      !project?.isActive ||
      !project.webhookEnabled ||
      !project.webhookUrl ||
      !project.webhookSecretHash
    ) {
      this.logger.log({ msg: 'project_webhook_skipped', projectId, eventId: payload.eventId });
      return;
    }

    let targetUrl: string;
    try {
      targetUrl = (await validatePublicHttpsUrl(project.webhookUrl)).href;
    } catch {
      this.logger.warn({ msg: 'project_webhook_ssrf_blocked', projectId });
      return;
    }

    const result = await postProjectWebhook(
      targetUrl,
      project.webhookSecretHash,
      serializeProjectWebhookPayload(payload),
      payload.eventId,
      this.config.get('WEBHOOK_DELIVERY_TIMEOUT_MS', { infer: true }),
    );
    if (!result.ok) {
      this.logger.warn({
        msg: 'project_webhook_failed',
        projectId,
        eventId: payload.eventId,
        httpStatus: result.httpStatus,
        errorCode: result.errorCode,
      });
    }
  }
}
