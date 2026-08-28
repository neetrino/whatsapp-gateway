import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { bootstrapAdminFromEnv } from '../auth/bootstrap-admin';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await bootstrapAdminFromEnv(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
