import { ProjectWebhooksService } from '../../src/projects/project-webhooks.service';

describe('ProjectWebhooksService', () => {
  const pepper = 'test-pepper-32-characters-min!!';

  const build = () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1' }),
        update: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
    };
    const config = { get: jest.fn(() => pepper) };
    const service = new ProjectWebhooksService(prisma as never, config as never);
    return { service, prisma };
  };

  it('stores hashed secret metadata without plaintext column', async () => {
    const { service, prisma } = build();
    await service.regenerateSecret('p1');
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        webhookSecretHash: expect.any(String),
        webhookSecretPrefix: expect.stringMatching(/^[a-f0-9]{6}$/),
        webhookSecretLast4: expect.stringMatching(/^[a-f0-9]{4}$/),
      },
    });
    const updateArg = prisma.project.update.mock.calls[0]?.[0] as {
      data: Record<string, string>;
    };
    expect(updateArg.data.webhookSecret).toBeUndefined();
    expect(updateArg.data.webhookSecretHash).toHaveLength(64);
  });
});
