import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('databaseUrl');
    super(
      url
        ? {
            datasources: {
              db: { url },
            },
          }
        : undefined,
    );
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('databaseUrl');
    if (!url) {
      this.logger.warn(
        'DATABASE_URL not set — Prisma will not connect (FCM device APIs unavailable)',
      );
      return;
    }
    await this.$connect();
    this.connected = true;
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
      this.connected = false;
    }
  }
}
