const secret = '0123456789abcdef0123456789abcdef';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'file:./data/test.db';
process.env.COOKIE_SECRET = secret;
process.env.JWT_SECRET = secret;
process.env.TOKEN_PEPPER = secret;
process.env.WAHA_BASE_URL = 'http://localhost:3999';
process.env.WAHA_API_KEY = 'test-waha-key';
process.env.WAHA_WEBHOOK_SECRET = 'webhook-secret-placeholder-32chars!!';
process.env.GATEWAY_INTERNAL_URL = 'http://localhost:3000';
