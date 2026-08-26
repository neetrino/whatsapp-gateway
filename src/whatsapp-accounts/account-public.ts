import { WhatsappAccountMode, SessionStatus } from '@prisma/client';

export interface V1AccountPublic {
  id: string;
  label: string;
  mode: WhatsappAccountMode;
  status: SessionStatus;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const maskPhoneNumber = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length <= 4) return '••••';
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
};

export const toV1AccountPublic = (account: {
  id: string;
  label: string;
  mode: WhatsappAccountMode;
  status: SessionStatus;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): V1AccountPublic => ({
  id: account.id,
  label: account.label,
  mode: account.mode,
  status: account.status,
  phoneNumber: maskPhoneNumber(account.phoneNumber),
  isActive: account.isActive,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString(),
});
