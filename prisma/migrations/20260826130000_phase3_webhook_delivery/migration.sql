-- Phase 3 Slice B: Project webhook settings (hashed secret) and durable delivery queue.

CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'EXHAUSTED', 'SKIPPED');

ALTER TABLE "projects"
  ADD COLUMN "webhookUrl" TEXT,
  ADD COLUMN "webhookSecretHash" TEXT,
  ADD COLUMN "webhookSecretPrefix" TEXT,
  ADD COLUMN "webhookSecretLast4" TEXT,
  ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "project_webhook_deliveries" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "whatsappAccountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "wahaRequestId" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastHttpStatus" INTEGER,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_webhook_deliveries_projectId_eventId_key"
  ON "project_webhook_deliveries"("projectId", "eventId");
CREATE INDEX "project_webhook_deliveries_projectId_createdAt_idx"
  ON "project_webhook_deliveries"("projectId", "createdAt");
CREATE INDEX "project_webhook_deliveries_whatsappAccountId_createdAt_idx"
  ON "project_webhook_deliveries"("whatsappAccountId", "createdAt");
CREATE INDEX "project_webhook_deliveries_status_nextAttemptAt_idx"
  ON "project_webhook_deliveries"("status", "nextAttemptAt");

ALTER TABLE "project_webhook_deliveries"
  ADD CONSTRAINT "project_webhook_deliveries_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_webhook_deliveries"
  ADD CONSTRAINT "project_webhook_deliveries_whatsappAccountId_fkey"
  FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
