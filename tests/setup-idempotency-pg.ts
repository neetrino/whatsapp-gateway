/**
 * Dedicated env for PostgreSQL idempotency concurrency tests.
 * Never falls back to DATABASE_URL. Refuses when the two URLs are identical.
 */
const flag = process.env.IDEMPOTENCY_PG_INTEGRATION;
const pgUrl = process.env.IDEMPOTENCY_PG_URL;
const databaseUrl = process.env.DATABASE_URL;

if (flag !== '1') {
  throw new Error(
    'Refusing to run: set IDEMPOTENCY_PG_INTEGRATION=1 and IDEMPOTENCY_PG_URL to a disposable PostgreSQL database.',
  );
}
if (!pgUrl) {
  throw new Error('Refusing to run: IDEMPOTENCY_PG_URL is required. Do not use DATABASE_URL.');
}
if (databaseUrl && pgUrl === databaseUrl) {
  throw new Error(
    'Refusing to use DATABASE_URL for idempotency PostgreSQL tests. Point IDEMPOTENCY_PG_URL at a disposable database.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://invalid.invalid:5432/refused';
