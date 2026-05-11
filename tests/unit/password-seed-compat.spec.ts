import { hashPassword, verifyPassword } from '../../src/common/utils/password';

describe('password hashing (seed + login compatibility)', () => {
  it('verifyPassword accepts hash from hashPassword', async () => {
    const plain = 'admin12345678';
    const hash = await hashPassword(plain);
    await expect(verifyPassword(hash, plain)).resolves.toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple-12');
    await expect(verifyPassword(hash, 'wrong-password-12')).resolves.toBe(false);
  });
});
