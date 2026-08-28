import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookDeliveryStatus } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.validation';
import { validatePublicHttpsUrl } from '../common/utils/public-url';
import { PrismaService } from '../prisma/prisma.service';
import type { ProjectWebhookPayload } from './project-event.types';
import { postProjectWebhook } from './project-webhook-post';
import { payloadHashOf, serializeProjectWebhookPayload } from './webhook-payload';

const WORKER_INTERVAL_MS = 2_000;
const BATCH_SIZE = 10;

@Injectable()
export class ProjectWebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectWebhookDeliveryService.name);
  private workerTimer: ReturnType<typeof setInterval> | undefined;
  private workerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onModuleInit(): void {
    this.workerTimer = setInterval(() => void this.runWorkerTick(), WORKER_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  async enqueueDelivery(
    projectId: string,
    accountId: string,
    payload: ProjectWebhookPayload,
    wahaRequestId: string | undefined,
  ): Promise<void> {
    const project = await this.loadProject(projectId);
    if (!this.isDeliverable(project)) {
      const reason = !project?.isActive ? 'PROJECT_INACTIVE' : 'WEBHOOK_DISABLED';
      await this.recordSkipped(projectId, accountId, payload, wahaRequestId, reason);
      return;
    }
    await this.insertPending(projectId, accountId, payload, wahaRequestId);
  }

  async getDeliveryStats(projectId: string) {
    const [counts, recent] = await Promise.all([
      this.prisma.projectWebhookDelivery.groupBy({
        by: ['status'],
        where: { projectId },
        _count: { _all: true },
      }),
      this.prisma.projectWebhookDelivery.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          eventId: true,
          eventType: true,
          status: true,
          attemptCount: true,
          lastHttpStatus: true,
          lastErrorCode: true,
          whatsappAccountId: true,
          createdAt: true,
          deliveredAt: true,
        },
      }),
    ]);
    return { counts, recent };
  }

  /** Test hook: process due deliveries synchronously. */
  async processDueDeliveriesForTests(): Promise<void> {
    await this.runWorkerTick();
  }

  private async runWorkerTick(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      const due = await this.prisma.projectWebhookDelivery.findMany({
        where: {
          status: WebhookDeliveryStatus.PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });
      for (const row of due) {
        await this.attemptDelivery(row.id);
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async attemptDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.projectWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        project: {
          select: {
            webhookEnabled: true,
            webhookUrl: true,
            webhookSecretHash: true,
            isActive: true,
          },
        },
      },
    });
    if (!delivery || delivery.status !== WebhookDeliveryStatus.PENDING) return;
    if (!this.isDeliverable(delivery.project)) {
      await this.markFinal(deliveryId, WebhookDeliveryStatus.SKIPPED, 'WEBHOOK_DISABLED');
      return;
    }

    const maxAttempts = this.config.get('WEBHOOK_MAX_ATTEMPTS', { infer: true });
    const attemptNumber = delivery.attemptCount + 1;
    let targetUrl: string;
    try {
      targetUrl = (await validatePublicHttpsUrl(delivery.project.webhookUrl!)).href;
    } catch {
      await this.markFinal(deliveryId, WebhookDeliveryStatus.FAILED, 'SSRF_BLOCKED');
      return;
    }

    const timeoutMs = this.config.get('WEBHOOK_DELIVERY_TIMEOUT_MS', { infer: true });
    const result = await postProjectWebhook(
      targetUrl,
      delivery.project.webhookSecretHash!,
      delivery.payloadJson,
      delivery.eventId,
      timeoutMs,
    );
    await this.applyAttemptResult(deliveryId, attemptNumber, maxAttempts, result);
  }

  private async applyAttemptResult(
    deliveryId: string,
    attemptNumber: number,
    maxAttempts: number,
    result: { ok: boolean; httpStatus: number | null; errorCode: string | null },
  ): Promise<void> {
    const now = new Date();
    if (result.ok) {
      await this.prisma.projectWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          attemptCount: attemptNumber,
          lastAttemptAt: now,
          lastHttpStatus: result.httpStatus,
          lastErrorCode: null,
          status: WebhookDeliveryStatus.DELIVERED,
          deliveredAt: now,
          nextAttemptAt: null,
        },
      });
      return;
    }
    const baseDelayMs = this.config.get('WEBHOOK_RETRY_BASE_MS', { infer: true });
    const exhausted = attemptNumber >= maxAttempts;
    await this.prisma.projectWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attemptCount: attemptNumber,
        lastAttemptAt: now,
        lastHttpStatus: result.httpStatus,
        lastErrorCode: result.errorCode,
        status: exhausted ? WebhookDeliveryStatus.EXHAUSTED : WebhookDeliveryStatus.PENDING,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + baseDelayMs * attemptNumber),
      },
    });
  }

  private async insertPending(
    projectId: string,
    accountId: string,
    payload: ProjectWebhookPayload,
    wahaRequestId: string | undefined,
  ): Promise<void> {
    const payloadJson = serializeProjectWebhookPayload(payload);
    try {
      await this.prisma.projectWebhookDelivery.create({
        data: {
          projectId,
          whatsappAccountId: accountId,
          eventId: payload.eventId,
          wahaRequestId: wahaRequestId ?? null,
          eventType: payload.type,
          payloadJson,
          payloadHash: payloadHashOf(payloadJson),
          status: WebhookDeliveryStatus.PENDING,
          nextAttemptAt: new Date(),
        },
      });
    } catch {
      this.logger.log({ msg: 'project_webhook_duplicate', projectId, eventId: payload.eventId });
    }
  }

  private async recordSkipped(
    projectId: string,
    accountId: string,
    payload: ProjectWebhookPayload,
    wahaRequestId: string | undefined,
    reason: string,
  ): Promise<void> {
    const payloadJson = serializeProjectWebhookPayload(payload);
    try {
      await this.prisma.projectWebhookDelivery.create({
        data: {
          projectId,
          whatsappAccountId: accountId,
          eventId: payload.eventId,
          wahaRequestId: wahaRequestId ?? null,
          eventType: payload.type,
          payloadJson,
          payloadHash: payloadHashOf(payloadJson),
          status: WebhookDeliveryStatus.SKIPPED,
          lastErrorCode: reason,
        },
      });
    } catch {
      /* duplicate event */
    }
  }

  private async markFinal(
    deliveryId: string,
    status: WebhookDeliveryStatus,
    errorCode: string,
  ): Promise<void> {
    await this.prisma.projectWebhookDelivery.update({
      where: { id: deliveryId },
      data: { status, lastErrorCode: errorCode, nextAttemptAt: null },
    });
  }

  private loadProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        webhookEnabled: true,
        webhookUrl: true,
        webhookSecretHash: true,
        isActive: true,
      },
    });
  }

  private isDeliverable(
    project:
      | {
          webhookEnabled: boolean;
          webhookUrl: string | null;
          webhookSecretHash: string | null;
          isActive: boolean;
        }
      | null
      | undefined,
  ): boolean {
    return Boolean(
      project?.isActive &&
      project.webhookEnabled &&
      project.webhookUrl &&
      project.webhookSecretHash,
    );
  }
}
