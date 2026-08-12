import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { DatabaseService } from "../../common/database/database.service";
import { type NewUser, type User, users } from "./schemas/user.schema";

@Injectable()
export class IdentityDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await this.databaseService.connection
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    return user ?? null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
    country?: string;
    language?: string;
  }): Promise<User> {
    const newUser: NewUser = {
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      displayName: data.displayName?.trim() || null,
      country: data.country ?? "PL",
      language: data.language ?? "ru",
    };

    const [createdUser] = await this.databaseService.connection
      .insert(users)
      .values(newUser)
      .returning();

    if (!createdUser) {
      throw new Error("Failed to create user");
    }

    return createdUser;
  }
}
