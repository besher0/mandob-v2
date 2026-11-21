import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    const max = Number(configService.get<string>('DB_POOL_MAX') ?? 10);
    if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('DB_POOL_MAX must be between 1 and 100');
    const adapter = new PrismaPg({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
