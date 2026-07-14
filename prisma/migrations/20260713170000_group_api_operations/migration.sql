-- CreateEnum
CREATE TYPE "GroupApiOperationType" AS ENUM ('CREATE_GROUP', 'ADD_PARTICIPANTS');

-- CreateEnum
CREATE TYPE "GroupApiOperationStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');

-- CreateTable
CREATE TABLE "group_api_operations" (
    "id" TEXT NOT NULL,
    "whatsappAccountId" TEXT NOT NULL,
    "operationType" "GroupApiOperationType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "GroupApiOperationStatus" NOT NULL DEFAULT 'PROCESSING',
    "groupId" TEXT,
    "normalizedResponse" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_api_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_api_operations_whatsappAccountId_createdAt_idx" ON "group_api_operations"("whatsappAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "group_api_operations_whatsappAccountId_idempotencyKey_key" ON "group_api_operations"("whatsappAccountId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "group_api_operations" ADD CONSTRAINT "group_api_operations_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
