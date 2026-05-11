const secret = '0123456789abcdef0123456789abcdef';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.APP_URL = 'http://localhost:3000';
process.env.GATEWAY_PUBLIC_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test?schema=public';
process.env.COOKIE_SECRET = secret;
process.env.JWT_SECRET = secret;
process.env.TOKEN_PEPPER = secret;
process.env.WAHA_BASE_URL = 'http://localhost:3999';
process.env.WAHA_API_KEY = 'test-waha-key';
process.env.WAHA_WEBHOOK_SECRET = 'webhook-secret-placeholder-32chars!!';
process.env.API_TOKEN_PREFIX = 'gw_test';
process.env.MAX_TEXT_LENGTH = '4096';
process.env.MAX_CAPTION_LENGTH = '4096';
process.env.MAX_IMAGE_SIZE_MB = '10';
process.env.MAX_VIDEO_SIZE_MB = '50';
process.env.RATE_LIMIT_SEND = '1000';
