import { PrismaClient, Role, SessionStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/common/utils/password';

const prisma = new PrismaClient();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const generateSessionName = (): string => `wa_${randomBytes(8).toString('hex')}`;

const main = async (): Promise<void> => {
  const adminEmail = requireEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requireEnv('ADMIN_PASSWORD');
  const adminName = process.env.ADMIN_NAME ?? 'Admin';

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const existingAccount = await prisma.whatsappAccount.findUnique({
    where: { userId: admin.id },
  });

  if (!existingAccount) {
    await prisma.whatsappAccount.create({
      data: {
        userId: admin.id,
        label: `${adminName}'s WhatsApp`,
        sessionName: generateSessionName(),
        status: SessionStatus.QR_REQUIRED,
        isActive: true,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete. Admin user: ${adminEmail}`);
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
