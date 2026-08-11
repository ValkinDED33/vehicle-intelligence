import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../common/database/database.service";
import { sql } from "drizzle-orm";

@Injectable()
export class IdentityDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string) {
    const res = await this.databaseService.connection.execute(
      `SELECT id, email, password_hash, display_name, country, language FROM users WHERE email = $1`,
      [email],
    );
    // Drizzle returns driver-specific shape; keep this minimal for now
    return (res as any).all?.()[0] ?? null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
    country?: string;
    language?: string;
  }) {
    const res = await this.databaseService.connection.execute(
      `INSERT INTO users (email, password_hash, display_name, country, language) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, display_name, country, language`,
      [
        data.email,
        data.passwordHash,
        data.displayName ?? null,
        data.country ?? "PL",
        data.language ?? "ru",
      ],
    );

    return (res as any).all?.()[0] ?? null;
  }
}
