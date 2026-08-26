import type { INestApplication } from '@nestjs/common';
import express, { type Request } from 'express';

const inboundPath = (req: { method?: string; url?: string }): boolean => {
  const path = req.url?.split('?')[0];
  return req.method === 'POST' && path === '/internal/waha/events';
};

export const attachGatewayMiddleware = (app: INestApplication): void => {
  const http = app.getHttpAdapter().getInstance();
  http.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        if (inboundPath(req)) {
          (req as Request & { rawBody?: Buffer }).rawBody = buf;
        }
      },
    }),
  );
  http.use(express.urlencoded({ extended: true }));
};
