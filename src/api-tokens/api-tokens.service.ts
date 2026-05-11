import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiToken, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiToken, hashApiToken } from '../common/utils/tokens';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { EnvironmentVariables } from '../config/env.validation';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

export interface ApiTokenMetadata {
  id: string;
  whatsappAccountId: string;
  name: string;
  tokenPrefix: string;
  last4: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface IssuedApiToken extends ApiTokenMetadata {
  raw: string;
}

const toMetadata = (token: ApiToken): ApiTokenMetadata => ({
  id: token.id,
  whatsappAccountId: token.whatsappAccountId,
  name: token.name,
  tokenPrefix: token.tokenPrefix,
  last4: token.last4,
  lastUsedAt: token.lastUsedAt,
  revokedAt: token.revokedAt,
  createdAt: token.createdAt,
});

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async create(whatsappAccountId: string, name?: string): Promise<IssuedApiToken> {
    await this.assertAccountExists(whatsappAccountId);
    const prefix = this.configService.get('API_TOKEN_PREFIX', { infer: true });
    const pepper = this.configService.get('TOKEN_PEPPER', { infer: true });
    const generated = generateApiToken(prefix);
    const tokenHash = hashApiToken(generated.raw, pepper);
    const token = await this.prisma.apiToken.create({
      data: {
        whatsappAccountId,
        name: name ?? 'API token',
        tokenHash,
        tokenPrefix: generated.tokenPrefix,
        last4: generated.last4,
      },
    });
    return { ...toMetadata(token), raw: generated.raw };
  }

  async listForAccount(whatsappAccountId: string): Promise<ApiTokenMetadata[]> {
    const tokens = await this.prisma.apiToken.findMany({
      where: { whatsappAccountId },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map(toMetadata);
  }

  async listAll(): Promise<Array<ApiTokenMetadata & { ownerEmail: string; ownerId: string }>> {
    const tokens = await this.prisma.apiToken.findMany({
      include: { whatsappAccount: { include: { user: { select: { id: true, email: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map((t) => ({
      ...toMetadata(t),
      ownerEmail: t.whatsappAccount.user.email,
      ownerId: t.whatsappAccount.user.id,
    }));
  }

  async revoke(tokenId: string, actor: AuthenticatedUser): Promise<ApiTokenMetadata> {
    const token = await this.prisma.apiToken.findUnique({
      where: { id: tokenId },
      include: { whatsappAccount: true },
    });
    if (!token) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API token not found.',
        status: 404,
      });
    }
    this.assertActorMayManage(token.whatsappAccount.userId, actor);
    if (token.revokedAt) return toMetadata(token);
    const updated = await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    return toMetadata(updated);
  }

  async regenerate(tokenId: string, actor: AuthenticatedUser): Promise<IssuedApiToken> {
    const token = await this.prisma.apiToken.findUnique({
      where: { id: tokenId },
      include: { whatsappAccount: true },
    });
    if (!token) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API token not found.',
        status: 404,
      });
    }
    this.assertActorMayManage(token.whatsappAccount.userId, actor);
    const prefix = this.configService.get('API_TOKEN_PREFIX', { infer: true });
    const pepper = this.configService.get('TOKEN_PEPPER', { infer: true });
    const generated = generateApiToken(prefix);
    const tokenHash = hashApiToken(generated.raw, pepper);
    const updated = await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: {
        tokenHash,
        tokenPrefix: generated.tokenPrefix,
        last4: generated.last4,
        revokedAt: null,
        lastUsedAt: null,
      },
    });
    return { ...toMetadata(updated), raw: generated.raw };
  }

  async findValidByRaw(rawToken: string): Promise<{
    apiTokenId: string;
    whatsappAccountId: string;
    sessionName: string;
    revoked: boolean;
  } | null> {
    const pepper = this.configService.get('TOKEN_PEPPER', { infer: true });
    const tokenHash = hashApiToken(rawToken, pepper);
    const found = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { whatsappAccount: true },
    });
    if (!found) return null;
    return {
      apiTokenId: found.id,
      whatsappAccountId: found.whatsappAccount.id,
      sessionName: found.whatsappAccount.sessionName,
      revoked: found.revokedAt !== null,
    };
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.prisma.apiToken
      .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  private async assertAccountExists(whatsappAccountId: string): Promise<void> {
    const exists = await this.prisma.whatsappAccount.findUnique({
      where: { id: whatsappAccountId },
      select: { id: true },
    });
    if (!exists) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'WhatsApp account not found.',
        status: 404,
      });
    }
  }

  private assertActorMayManage(ownerId: string, actor: AuthenticatedUser): void {
    if (actor.role === Role.ADMIN) return;
    if (actor.id !== ownerId) {
      throw new AppException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'You may not manage this API token.',
        status: 403,
      });
    }
  }
}
