import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly database: NodePgDatabase;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>("DATABASE_URL");

    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    this.database = drizzle(this.pool);
  }

  get connection(): NodePgDatabase {
    return this.database;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
