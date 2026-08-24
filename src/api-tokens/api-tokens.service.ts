import { Injectable } from '@nestjs/common';
import { ApiToken } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiToken, hashApiToken } from '../common/utils/tokens';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import type { EnvironmentVariables } from '../config/env.validation';

export interface ApiTokenMetadata {
  id: string;
  projectId: string;
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

export interface ResolvedApiToken {
  apiTokenId: string;
  projectId: string;
  projectIsActive: boolean;
  revoked: boolean;
  activeAccounts: Array<{ id: string; sessionName: string }>;
}

const toMetadata = (token: ApiToken): ApiTokenMetadata => ({
  id: token.id,
  projectId: token.projectId,
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

  async create(projectId: string, name?: string): Promise<IssuedApiToken> {
    await this.assertProjectExists(projectId);
    const prefix = this.configService.get('API_TOKEN_PREFIX', { infer: true });
    const pepper = this.configService.get('TOKEN_PEPPER', { infer: true });
    const generated = generateApiToken(prefix);
    const tokenHash = hashApiToken(generated.raw, pepper);
    const token = await this.prisma.apiToken.create({
      data: {
        projectId,
        name: name ?? 'API token',
        tokenHash,
        tokenPrefix: generated.tokenPrefix,
        last4: generated.last4,
      },
    });
    return { ...toMetadata(token), raw: generated.raw };
  }

  async listForProject(projectId: string): Promise<ApiTokenMetadata[]> {
    const tokens = await this.prisma.apiToken.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return tokens.map(toMetadata);
  }

  async revoke(projectId: string, tokenId: string): Promise<ApiTokenMetadata> {
    const token = await this.requireProjectToken(projectId, tokenId);
    if (token.revokedAt) return toMetadata(token);
    const updated = await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
    return toMetadata(updated);
  }

  async regenerate(projectId: string, tokenId: string): Promise<IssuedApiToken> {
    await this.requireProjectToken(projectId, tokenId);
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

  async findValidByRaw(rawToken: string): Promise<ResolvedApiToken | null> {
    const pepper = this.configService.get('TOKEN_PEPPER', { infer: true });
    const tokenHash = hashApiToken(rawToken, pepper);
    const found = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      include: {
        project: {
          select: {
            id: true,
            isActive: true,
            whatsappAccounts: {
              where: { isActive: true },
              select: { id: true, sessionName: true },
            },
          },
        },
      },
    });
    if (!found) return null;
    return {
      apiTokenId: found.id,
      projectId: found.project.id,
      projectIsActive: found.project.isActive,
      revoked: found.revokedAt !== null,
      activeAccounts: found.project.whatsappAccounts,
    };
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    await this.prisma.apiToken
      .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  private async requireProjectToken(projectId: string, tokenId: string): Promise<ApiToken> {
    const token = await this.prisma.apiToken.findFirst({ where: { id: tokenId, projectId } });
    if (!token) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'API token not found.',
        status: 404,
      });
    }
    return token;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Project not found.',
        status: 404,
      });
    }
  }
}
