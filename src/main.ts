import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/env.validation';

const VIEWS_DIR = join(__dirname, 'dashboard', 'views');
const PUBLIC_DIR = join(__dirname, 'dashboard', 'public');

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });
  const configService = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const cookieSecret = configService.get('COOKIE_SECRET', { infer: true });
  const port = configService.get('PORT', { infer: true });
  const isProd = configService.get('NODE_ENV', { infer: true }) === 'production';

  app.use(cookieParser(cookieSecret));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.set('trust proxy', 1);

  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: join(VIEWS_DIR, 'layouts'),
      helpers: {
        ifEquals: function (
          a: unknown,
          b: unknown,
          options: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string },
        ) {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const ctx = this;
          return a === b ? options.fn(ctx) : options.inverse(ctx);
        },
      },
    }),
  );
  app.setViewEngine('hbs');
  app.setBaseViewsDir(VIEWS_DIR);
  app.useStaticAssets(PUBLIC_DIR, { prefix: '/assets' });

  await app.listen(port);
  Logger.log(`WhatsApp Gateway listening on :${port} (${isProd ? 'production' : 'development'})`);
};

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
