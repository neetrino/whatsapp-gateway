-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "outbound_message_logs" ADD COLUMN "messageType" "MessageType" NOT NULL DEFAULT 'TEXT';
