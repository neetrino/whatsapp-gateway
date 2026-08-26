-- Phase 2 follow-up: index for SENT-log reconciliation of idempotency keys.
-- Additive only. Existing outbound_message_logs and idempotency rows are preserved.

CREATE INDEX "outbound_message_logs_whatsappAccountId_idempotencyKey_requestHash_idx"
  ON "outbound_message_logs"("whatsappAccountId", "idempotencyKey", "requestHash");
