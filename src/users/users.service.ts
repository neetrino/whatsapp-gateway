import { Injectable } from '@nestjs/common';
import { Prisma, Role, SessionStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/utils/password';
import { generateSessionName } from '../common/utils/session-name';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

export type SafeUser = Omit<User, 'passwordHash'>;

const stripPasswordHash = (user: User): SafeUser => {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithAccount(input: CreateUserDto): Promise<SafeUser> {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
            role: input.role ?? Role.USER,
            isActive: input.isActive ?? true,
          },
        });
        await tx.whatsappAccount.create({
          data: {
            userId: created.id,
            label: input.label ?? `${created.name}'s WhatsApp`,
            sessionName: generateSessionName(),
            status: SessionStatus.QR_REQUIRED,
            isActive: true,
          },
        });
        return created;
      });
      return stripPasswordHash(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException({
          code: ERROR_CODES.CONFLICT,
          message: 'A user with this email already exists.',
          status: 409,
        });
      }
      throw error;
    }
  }

  async list(): Promise<Array<SafeUser & { whatsappAccount: { status: SessionStatus } | null }>> {
    const users = await this.prisma.user.findMany({
      include: { whatsappAccount: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => {
      const { passwordHash: _passwordHash, whatsappAccount, ...rest } = u;
      return { ...rest, whatsappAccount };
    });
  }

  async getById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'User not found.',
        status: 404,
      });
    }
    return stripPasswordHash(user);
  }

  async update(id: string, input: UpdateUserDto): Promise<SafeUser> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      return stripPasswordHash(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new AppException({
            code: ERROR_CODES.CONFLICT,
            message: 'Email is already in use.',
            status: 409,
          });
        }
        if (error.code === 'P2025') {
          throw new AppException({
            code: ERROR_CODES.NOT_FOUND,
            message: 'User not found.',
            status: 404,
          });
        }
      }
      throw error;
    }
  }

  async resetPassword(id: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async disable(id: string): Promise<SafeUser> {
    return this.update(id, { isActive: false });
  }
}
