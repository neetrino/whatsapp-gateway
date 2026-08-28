-- CreateTable
CREATE TABLE "api_idempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whatsappAccountId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultJson" TEXT,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "api_idempotency_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "api_idempotency_whatsappAccountId_scope_idempotencyKey_key" ON "api_idempotency"("whatsappAccountId", "scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "api_idempotency_expiresAt_idx" ON "api_idempotency"("expiresAt");
