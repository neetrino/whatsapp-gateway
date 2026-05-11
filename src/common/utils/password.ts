import * as argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = async (plain: string): Promise<string> =>
  argon2.hash(plain, ARGON2_OPTIONS);

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
};
