import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { drizzle, type DrizzleConfig } from "drizzle-orm";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private readonly db;

  constructor() {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    this.pool = new Pool({ connectionString: DATABASE_URL });
    this.db = drizzle(this.pool as any);
  }

  get connection() {
    return this.db;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
