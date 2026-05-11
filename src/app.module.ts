import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { validateEnv } from './config/env.validation';
import type { EnvironmentVariables } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { JwtCookieGuard } from './common/guards/jwt-cookie.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { RequestIdMiddleware } from './common/interceptors/request-id.middleware';
import { VALIDATION_PIPE_OPTIONS } from './common/pipes/validation.factory';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WhatsappAccountsModule } from './whatsapp-accounts/whatsapp-accounts.module';
import { ApiTokensModule } from './api-tokens/api-tokens.module';
import { WahaModule } from './waha/waha.module';
import { MessagesModule } from './messages/messages.module';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw) => validateEnv(raw),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: configService.get('RATE_LIMIT_SEND', { infer: true }),
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WhatsappAccountsModule,
    ApiTokensModule,
    WahaModule,
    MessagesModule,
    HealthModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_PIPE, useFactory: () => new ValidationPipe(VALIDATION_PIPE_OPTIONS) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtCookieGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware).forRoutes('*');
  }
}
