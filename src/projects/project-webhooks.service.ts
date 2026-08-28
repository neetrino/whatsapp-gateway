import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Project } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { validatePublicHttpsUrl, InvalidPublicUrlError } from '../common/utils/public-url';
import { generateWebhookSecret, type GeneratedWebhookSecret } from '../webhooks/webhook-secret';

@Injectable()
export class ProjectWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async updateSettings(
    projectId: string,
    input: { webhookUrl?: string; webhookEnabled?: boolean },
  ): Promise<Project> {
    await this.assertProject(projectId);
    const data: { webhookUrl?: string | null; webhookEnabled?: boolean } = {};
    if (input.webhookEnabled !== undefined) data.webhookEnabled = input.webhookEnabled;
    if (input.webhookUrl !== undefined) {
      data.webhookUrl =
        input.webhookUrl.length === 0 ? null : (await this.validateUrl(input.webhookUrl)).href;
    }
    return this.prisma.project.update({ where: { id: projectId }, data });
  }

  async regenerateSecret(projectId: string): Promise<GeneratedWebhookSecret> {
    await this.assertProject(projectId);
    const pepper = this.config.get('TOKEN_PEPPER', { infer: true });
    const generated = generateWebhookSecret(pepper);
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        webhookSecretHash: generated.secretHash,
        webhookSecretPrefix: generated.tokenPrefix,
        webhookSecretLast4: generated.last4,
      },
    });
    return generated;
  }

  private async validateUrl(raw: string) {
    try {
      return await validatePublicHttpsUrl(raw);
    } catch (error) {
      const message =
        error instanceof InvalidPublicUrlError ? error.message : 'Invalid project webhook URL.';
      throw new AppException({ code: ERROR_CODES.INVALID_WEBHOOK_URL, message, status: 400 });
    }
  }

  private async assertProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Project not found.',
        status: 404,
      });
    }
  }
}
