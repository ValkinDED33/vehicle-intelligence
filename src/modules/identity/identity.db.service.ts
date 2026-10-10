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

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const [user] = await this.databaseService.connection
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    return user ?? null;
  }

  async findById(userId: string): Promise<User | null> {
    const [user] = await this.databaseService.connection
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ?? null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
    country?: string;
    language?: string;
    telegramId?: string;
    telegramUsername?: string | null;
    telegramPhotoUrl?: string | null;
  }): Promise<User> {
    const newUser: NewUser = {
      email: data.email.trim().toLowerCase(),
      passwordHash: data.passwordHash,
      displayName: data.displayName?.trim() || null,
      country: data.country ?? "PL",
      language: data.language ?? "uk",
      telegramId: data.telegramId ?? null,
      telegramUsername: data.telegramUsername ?? null,
      telegramPhotoUrl: data.telegramPhotoUrl ?? null,
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

  async updateTelegramProfile(
    userId: string,
    data: {
      displayName?: string | null;
      telegramUsername?: string | null;
      telegramPhotoUrl?: string | null;
    },
  ): Promise<User> {
    const [updatedUser] = await this.databaseService.connection
      .update(users)
      .set({
        displayName: data.displayName?.trim() || null,
        telegramUsername: data.telegramUsername ?? null,
        telegramPhotoUrl: data.telegramPhotoUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error("Failed to update Telegram user");
    }

    return updatedUser;
  }

  async updateProfile(
    userId: string,
    data: {
      displayName?: string | null;
      country?: string;
      language?: string;
    },
  ): Promise<User> {
    const [updatedUser] = await this.databaseService.connection
      .update(users)
      .set({
        ...(data.displayName !== undefined
          ? { displayName: data.displayName?.trim() || null }
          : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.language !== undefined ? { language: data.language } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error("Failed to update user profile");
    }

    return updatedUser;
  }
}
