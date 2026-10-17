import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export const PG_POOL_MAX = 3;

export function buildPgPoolConfig(connectionString: string): {
  connectionString: string;
  max: number;
} {
  return {
    connectionString,
    max: PG_POOL_MAX,
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg(buildPgPoolConfig(configService.getOrThrow<string>("DATABASE_URL")));
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
