import { PrismaClient } from '@prisma/client';
import { upsertSingletonAdmin } from '../src/auth/upsert-admin';

const prisma = new PrismaClient();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const adminEmail = requireEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requireEnv('ADMIN_PASSWORD');

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const result = await upsertSingletonAdmin(prisma, {
    email: adminEmail,
    password: adminPassword,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete. Admin: ${adminEmail} (${result.created ? 'created' : result.sessionBumped ? 'updated' : 'unchanged'})`,
  );
};

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
