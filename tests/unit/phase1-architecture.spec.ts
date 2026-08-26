import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith('.ts') || full.endsWith('.hbs') || full.endsWith('.prisma')) {
      files.push(full);
    }
  }
  return files;
};

describe('Phase 1 architecture remnants', () => {
  it('Prisma schema has Admin/Project ownership and no User/Role', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/model Admin/);
    expect(schema).toMatch(/model Project/);
    expect(schema).toMatch(/enum WhatsappAccountMode/);
    expect(schema).not.toMatch(/\benum Role\b/);
    expect(schema).not.toMatch(/\bmodel User\b/);
    expect(schema).toMatch(/projectId\s+String/);
    expect(schema).toMatch(/onDelete: Restrict/);
    expect(schema).toMatch(/singleton\s+Int\s+@unique/);
    expect(schema).not.toMatch(/model ApiToken \{[^}]*whatsappAccountId/s);
  });

  it('source tree no longer contains User/Role dashboard architecture', () => {
    const root = join(process.cwd(), 'src');
    const forbidden = [
      'UsersModule',
      'Role.ADMIN',
      'Role.USER',
      'RolesGuard',
      'createForUser',
      'getOwnByUserId',
      'AuthenticatedUser',
    ];
    const hits: string[] = [];
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8');
      for (const needle of forbidden) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
