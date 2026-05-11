/**
 * Session/CSRF cookie `secure` flag: production HTTPS deployments use NODE_ENV=production.
 * Local Docker / dev should use NODE_ENV=development with http://localhost so cookies work.
 */
export const cookieSecureFromNodeEnv = (nodeEnv: string): boolean => nodeEnv === 'production';
