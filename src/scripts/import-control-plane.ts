import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { SessionStatus, WhatsappAccountMode } from '../common/db-enums';

interface DumpAdmin {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  sessionVersion: number;
  singleton: number;
  createdAt: string;
  updatedAt: string;
}

interface DumpProject {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  webhookUrl: string | null;
  webhookSecretHash: string | null;
  webhookSecretPrefix: string | null;
  webhookSecretLast4: string | null;
  webhookEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DumpAccount {
  id: string;
  projectId: string;
  label: string;
  mode: WhatsappAccountMode;
  sessionName: string;
  status: SessionStatus;
  phoneNumber: string | null;
  isActive: boolean;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DumpToken {
  id: string;
  projectId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  last4: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ControlPlaneDump {
  admins: DumpAdmin[];
  projects: DumpProject[];
  accounts?: DumpAccount[];
  tokens?: DumpToken[];
  whatsapp_accounts?: DumpAccount[];
  api_tokens?: DumpToken[];
}

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null);

const main = async (): Promise<void> => {
  const path = process.env.CONTROL_PLANE_IMPORT ?? 'data/neon-control-plane.json';
  const dump = JSON.parse(readFileSync(path, 'utf8')) as ControlPlaneDump;
  const prisma = new PrismaClient();
  const accounts = dump.accounts ?? dump.whatsapp_accounts ?? [];
  const tokens = dump.tokens ?? dump.api_tokens ?? [];
  try {
    for (const admin of dump.admins ?? []) {
      await prisma.admin.upsert({
        where: { id: admin.id },
        create: {
          id: admin.id,
          email: admin.email,
          passwordHash: admin.passwordHash,
          isActive: admin.isActive,
          sessionVersion: admin.sessionVersion,
          singleton: admin.singleton,
          createdAt: new Date(admin.createdAt),
          updatedAt: new Date(admin.updatedAt),
        },
        update: {
          email: admin.email,
          passwordHash: admin.passwordHash,
          isActive: admin.isActive,
          sessionVersion: admin.sessionVersion,
        },
      });
    }
    for (const project of dump.projects ?? []) {
      await prisma.project.upsert({
        where: { id: project.id },
        create: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          isActive: project.isActive,
          webhookUrl: project.webhookUrl,
          webhookSecretHash: project.webhookSecretHash,
          webhookSecretPrefix: project.webhookSecretPrefix,
          webhookSecretLast4: project.webhookSecretLast4,
          webhookEnabled: project.webhookEnabled,
          createdAt: new Date(project.createdAt),
          updatedAt: new Date(project.updatedAt),
        },
        update: {
          name: project.name,
          slug: project.slug,
          isActive: project.isActive,
          webhookUrl: project.webhookUrl,
          webhookSecretHash: project.webhookSecretHash,
          webhookSecretPrefix: project.webhookSecretPrefix,
          webhookSecretLast4: project.webhookSecretLast4,
          webhookEnabled: project.webhookEnabled,
        },
      });
    }
    for (const account of accounts) {
      await prisma.whatsappAccount.upsert({
        where: { id: account.id },
        create: {
          id: account.id,
          projectId: account.projectId,
          label: account.label,
          mode: account.mode,
          sessionName: account.sessionName,
          status: account.status,
          phoneNumber: account.phoneNumber,
          isActive: account.isActive,
          lastConnectedAt: toDate(account.lastConnectedAt),
          lastDisconnectedAt: toDate(account.lastDisconnectedAt),
          createdAt: new Date(account.createdAt),
          updatedAt: new Date(account.updatedAt),
        },
        update: {
          label: account.label,
          mode: account.mode,
          sessionName: account.sessionName,
          status: account.status,
          phoneNumber: account.phoneNumber,
          isActive: account.isActive,
          lastConnectedAt: toDate(account.lastConnectedAt),
          lastDisconnectedAt: toDate(account.lastDisconnectedAt),
        },
      });
    }
    for (const token of tokens) {
      await prisma.apiToken.upsert({
        where: { id: token.id },
        create: {
          id: token.id,
          projectId: token.projectId,
          name: token.name,
          tokenHash: token.tokenHash,
          tokenPrefix: token.tokenPrefix,
          last4: token.last4,
          lastUsedAt: toDate(token.lastUsedAt),
          revokedAt: toDate(token.revokedAt),
          createdAt: new Date(token.createdAt),
          updatedAt: new Date(token.updatedAt),
        },
        update: {
          name: token.name,
          tokenHash: token.tokenHash,
          tokenPrefix: token.tokenPrefix,
          last4: token.last4,
          lastUsedAt: toDate(token.lastUsedAt),
          revokedAt: toDate(token.revokedAt),
        },
      });
    }
    // eslint-disable-next-line no-console
    console.log(
      `Imported control plane from ${path}: ${dump.admins?.length ?? 0} admin, ${dump.projects?.length ?? 0} projects, ${accounts.length} accounts, ${tokens.length} tokens.`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
