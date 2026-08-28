import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../common/utils/password';

export interface UpsertAdminInput {
  email: string;
  password: string;
}

export interface UpsertAdminResult {
  created: boolean;
  sessionBumped: boolean;
}

export const upsertSingletonAdmin = async (
  prisma: PrismaClient,
  input: UpsertAdminInput,
): Promise<UpsertAdminResult> => {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.admin.findUnique({ where: { singleton: 1 } });
  if (!existing) {
    await prisma.admin.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        isActive: true,
        singleton: 1,
      },
    });
    return { created: true, sessionBumped: false };
  }

  const passwordMatches = await verifyPassword(existing.passwordHash, input.password);
  const emailUnchanged = existing.email === email;
  const alreadyActive = existing.isActive;
  if (passwordMatches && emailUnchanged && alreadyActive) {
    return { created: false, sessionBumped: false };
  }

  const passwordHash = passwordMatches ? existing.passwordHash : await hashPassword(input.password);
  const credentialsChanged = !passwordMatches || !emailUnchanged;
  await prisma.admin.update({
    where: { id: existing.id },
    data: {
      email,
      passwordHash,
      isActive: true,
      ...(credentialsChanged ? { sessionVersion: { increment: 1 } } : {}),
    },
  });
  return { created: false, sessionBumped: credentialsChanged };
};
