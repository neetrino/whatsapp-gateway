-- Phase 2: durable account-scoped send idempotency.
-- Additive only: existing outbound_message_logs rows are preserved.

CREATE TYPE "OutboundIdempotencyStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');

ALTER TABLE "outbound_message_logs" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "outbound_message_logs" ADD COLUMN "requestHash" TEXT;

CREATE TABLE "outbound_message_idempotency" (
    "id" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "OutboundIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "requestId" TEXT,
    "messageId" TEXT,
    "wahaMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_message_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_message_idempotency_whatsappAccountId_idempotencyKey_key"
  ON "outbound_message_idempotency"("whatsappAccountId", "idempotencyKey");

CREATE INDEX "outbound_message_idempotency_whatsappAccountId_createdAt_idx"
  ON "outbound_message_idempotency"("whatsappAccountId", "createdAt");

ALTER TABLE "outbound_message_idempotency"
  ADD CONSTRAINT "outbound_message_idempotency_whatsappAccountId_fkey"
  FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
