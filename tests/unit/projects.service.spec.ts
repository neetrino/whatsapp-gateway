import { ProjectsService } from '../../src/projects/projects.service';
import { Prisma } from '@prisma/client';
import { ERROR_CODES } from '../../src/common/errors/error-codes';
import { assertValidProjectSlug } from '../../src/projects/project-slug';

describe('project slug', () => {
  it('normalizes and accepts a valid slug', () => {
    expect(assertValidProjectSlug(' NBOS ')).toBe('nbos');
  });

  it('rejects invalid slugs', () => {
    expect(() => assertValidProjectSlug('1bad')).toThrow();
    expect(() => assertValidProjectSlug('Bad_Slug')).toThrow();
    expect(() => assertValidProjectSlug('a--b')).toThrow();
    expect(() => assertValidProjectSlug('new')).toThrow();
  });
});

describe('ProjectsService', () => {
  it('creates a project with a unique slug', async () => {
    const created = {
      id: 'p1',
      name: 'NBOS',
      slug: 'nbos',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = { project: { create: jest.fn().mockResolvedValue(created) } };
    const service = new ProjectsService(prisma as never);
    await expect(service.create('NBOS', 'NBOS')).resolves.toEqual(created);
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: 'NBOS', slug: 'nbos', isActive: true },
    });
  });

  it('maps duplicate slug to conflict', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['slug'] },
    });
    const prisma = { project: { create: jest.fn().mockRejectedValue(prismaError) } };
    const service = new ProjectsService(prisma as never);
    await expect(service.create('NBOS', 'nbos')).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
    });
  });

  it('activates and deactivates a project', async () => {
    const project = { id: 'p1', name: 'NBOS', slug: 'nbos', isActive: true };
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue(project),
        update: jest.fn().mockImplementation(async ({ data }: { data: { isActive: boolean } }) => ({
          ...project,
          isActive: data.isActive,
        })),
      },
    };
    const service = new ProjectsService(prisma as never);
    await expect(service.setActive('p1', false)).resolves.toMatchObject({ isActive: false });
    await expect(service.setActive('p1', true)).resolves.toMatchObject({ isActive: true });
  });
});
