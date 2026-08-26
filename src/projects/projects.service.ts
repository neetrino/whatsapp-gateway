import { Injectable } from '@nestjs/common';
import { Prisma, type Project } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODES } from '../common/errors/error-codes';
import { validatePublicHttpsUrl, InvalidPublicUrlError } from '../common/utils/public-url';
import { assertValidProjectSlug } from './project-slug';

export interface ProjectCounts {
  tokenCount: number;
  accountCount: number;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, slugInput: string): Promise<Project> {
    const slug = assertValidProjectSlug(slugInput);
    try {
      return await this.prisma.project.create({
        data: { name: name.trim(), slug, isActive: true },
      });
    } catch (error) {
      this.rethrowSlugConflict(error);
      throw error;
    }
  }

  async list(): Promise<Array<Project & ProjectCounts>> {
    const projects = await this.prisma.project.findMany({
      include: { _count: { select: { apiTokens: true, whatsappAccounts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map(({ _count, ...project }) => ({
      ...project,
      tokenCount: _count.apiTokens,
      accountCount: _count.whatsappAccounts,
    }));
  }

  async getById(id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new AppException({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Project not found.',
        status: 404,
      });
    }
    return project;
  }

  async update(id: string, input: { name?: string; slug?: string }): Promise<Project> {
    await this.getById(id);
    const data: { name?: string; slug?: string } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined) data.slug = assertValidProjectSlug(input.slug);
    try {
      return await this.prisma.project.update({ where: { id }, data });
    } catch (error) {
      this.rethrowSlugConflict(error);
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<Project> {
    await this.getById(id);
    return this.prisma.project.update({ where: { id }, data: { isActive } });
  }

  async updateWebhookSettings(
    id: string,
    input: { webhookUrl?: string; webhookEnabled?: boolean },
  ): Promise<Project> {
    await this.getById(id);
    const data: { webhookUrl?: string | null; webhookEnabled?: boolean } = {};

    if (input.webhookEnabled !== undefined) {
      data.webhookEnabled = input.webhookEnabled;
    }
    if (input.webhookUrl !== undefined) {
      if (input.webhookUrl.length === 0) {
        data.webhookUrl = null;
      } else {
        try {
          const validated = await validatePublicHttpsUrl(input.webhookUrl);
          data.webhookUrl = validated.href;
        } catch (error) {
          const message =
            error instanceof InvalidPublicUrlError
              ? error.message
              : 'Invalid project webhook URL.';
          throw new AppException({
            code: ERROR_CODES.INVALID_WEBHOOK_URL,
            message,
            status: 400,
          });
        }
      }
    }

    return this.prisma.project.update({ where: { id }, data });
  }

  private rethrowSlugConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppException({
        code: ERROR_CODES.CONFLICT,
        message: 'A project with this slug already exists.',
        status: 409,
      });
    }
  }
}
