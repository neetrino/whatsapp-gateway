import { SessionStatus, WhatsappAccountMode } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

export const loadOwnedAccount = async (
  prisma: PrismaService,
  projectId: string,
  accountId: string,
): Promise<{
  id: string;
  sessionName: string;
  isActive: boolean;
  status: SessionStatus;
  label: string;
  mode: WhatsappAccountMode;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}> => {
  const account = await prisma.whatsappAccount.findFirst({
    where: { id: accountId, projectId },
    select: {
      id: true,
      sessionName: true,
      isActive: true,
      status: true,
      label: true,
      mode: true,
      phoneNumber: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!account) {
    throw new AppException({
      code: ERROR_CODES.NOT_FOUND,
      message: 'WhatsApp account not found.',
      status: 404,
    });
  }
  return account;
};

export const assertAccountReady = (account: {
  id: string;
  sessionName: string;
  isActive: boolean;
  status: SessionStatus;
}): { id: string; sessionName: string } => {
  if (!account.isActive) {
    throw new AppException({
      code: ERROR_CODES.ACCOUNT_INACTIVE,
      message: 'WhatsApp account is inactive.',
      status: 409,
    });
  }
  if (account.status !== SessionStatus.CONNECTED) {
    throw new AppException({
      code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
      message: 'WhatsApp account is not connected. Please scan QR code in Gateway dashboard.',
      status: 409,
    });
  }
  return { id: account.id, sessionName: account.sessionName };
};

export const loadConnectedAccount = async (
  prisma: PrismaService,
  projectId: string,
  accountId: string,
): Promise<{ id: string; sessionName: string }> => {
  const account = await loadOwnedAccount(prisma, projectId, accountId);
  return assertAccountReady(account);
};
