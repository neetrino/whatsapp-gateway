-- Allow multiple WhatsApp accounts per user (WAHA Plus multi-session).
DROP INDEX IF EXISTS "whatsapp_accounts_userId_key";

CREATE INDEX "whatsapp_accounts_userId_idx" ON "whatsapp_accounts"("userId");
