import { SessionStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';

export const loadConnectedAccount = async (
  prisma: PrismaService,
  projectId: string,
  accountId: string,
): Promise<{ id: string; sessionName: string }> => {
  const account = await prisma.whatsappAccount.findFirst({
    where: { id: accountId, projectId },
    select: { id: true, sessionName: true, isActive: true, status: true },
  });
  if (!account) {
    throw new AppException({
      code: ERROR_CODES.NOT_FOUND,
      message: 'WhatsApp account not found.',
      status: 404,
    });
  }
  if (!account.isActive || account.status !== SessionStatus.CONNECTED) {
    throw new AppException({
      code: ERROR_CODES.WHATSAPP_NOT_CONNECTED,
      message: 'WhatsApp account is not connected. Please scan QR code in Gateway dashboard.',
      status: 409,
    });
  }
  return { id: account.id, sessionName: account.sessionName };
};
