-- Phase 1: replace User/Role ownership with singleton Admin + Project.
-- Existing user/account/token rows are disposable test data and are dropped.
-- Compatible with both:
--   * dev-Karo (unique whatsapp_accounts_userId_key)
--   * origin/main (whatsapp_accounts_userId_idx after multi-account migration)

DELETE FROM "group_api_operations";
DELETE FROM "outbound_message_logs";
DELETE FROM "api_tokens";
DELETE FROM "whatsapp_accounts";
DELETE FROM "users";

ALTER TABLE "whatsapp_accounts" DROP CONSTRAINT IF EXISTS "whatsapp_accounts_userId_fkey";
ALTER TABLE "whatsapp_accounts" DROP CONSTRAINT IF EXISTS "whatsapp_accounts_userId_key";
DROP INDEX IF EXISTS "whatsapp_accounts_userId_key";
DROP INDEX IF EXISTS "whatsapp_accounts_userId_idx";
ALTER TABLE "whatsapp_accounts" DROP COLUMN IF EXISTS "userId";

ALTER TABLE "api_tokens" DROP CONSTRAINT IF EXISTS "api_tokens_whatsappAccountId_fkey";
DROP INDEX IF EXISTS "api_tokens_whatsappAccountId_idx";
ALTER TABLE "api_tokens" DROP COLUMN IF EXISTS "whatsappAccountId";

CREATE TYPE "WhatsappAccountMode" AS ENUM ('SEND_ONLY', 'MESSENGER');

CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "singleton" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admins_singleton_is_one" CHECK ("singleton" = 1)
);

CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE UNIQUE INDEX "admins_singleton_key" ON "admins"("singleton");

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

ALTER TABLE "whatsapp_accounts" ADD COLUMN "projectId" TEXT NOT NULL;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "mode" "WhatsappAccountMode" NOT NULL DEFAULT 'SEND_ONLY';

CREATE INDEX "whatsapp_accounts_projectId_idx" ON "whatsapp_accounts"("projectId");
CREATE INDEX "whatsapp_accounts_projectId_isActive_idx" ON "whatsapp_accounts"("projectId", "isActive");

ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_tokens" ADD COLUMN "projectId" TEXT NOT NULL;

CREATE INDEX "api_tokens_projectId_idx" ON "api_tokens"("projectId");

ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE IF EXISTS "users";
DROP TYPE IF EXISTS "Role";
