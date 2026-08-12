import { Controller, Get } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: "ok" }> {
    await this.databaseService.connection.execute(sql`SELECT 1`);

    return {
      status: "ok",
    };
  }
}
