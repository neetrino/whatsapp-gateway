import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { upsertSingletonAdmin } from './upsert-admin';

const logger = new Logger('BootstrapAdmin');

export const bootstrapAdminFromEnv = async (prisma: PrismaClient): Promise<void> => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    logger.warn('ADMIN_PASSWORD is shorter than 12 characters; admin seed skipped.');
    return;
  }
  const result = await upsertSingletonAdmin(prisma, { email, password });
  logger.log(
    `Admin ${email} ${result.created ? 'created' : result.sessionBumped ? 'updated' : 'unchanged'}.`,
  );
};
