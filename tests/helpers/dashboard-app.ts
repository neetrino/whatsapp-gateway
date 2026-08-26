import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import { engine } from 'express-handlebars';
import type { NestExpressApplication } from '@nestjs/platform-express';

export const configureDashboardTestApp = (app: NestExpressApplication): void => {
  const secret = process.env.COOKIE_SECRET ?? '';
  app.use(cookieParser(secret));
  const views = join(__dirname, '../../src/dashboard/views');
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: join(views, 'layouts'),
      helpers: {
        ifEquals: function (
          this: unknown,
          a: unknown,
          b: unknown,
          options: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string },
        ) {
          return a === b ? options.fn(this) : options.inverse(this);
        },
      },
    }),
  );
  app.setViewEngine('hbs');
  app.setBaseViewsDir(views);
};
