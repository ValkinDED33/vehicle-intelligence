import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

import { DatabaseService } from "../../common/database/database.service";
import { type NewUser, type User, users } from "./schemas/user.schema";
import { telegramLinks } from "./schemas/telegram-link.schema";
import { vehicles } from "../garage/schemas/vehicle.schema";

@Injectable()
export class IdentityDbService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createTelegramLink(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.databaseService.connection.insert(telegramLinks).values({ userId, tokenHash, expiresAt })
      .onConflictDoUpdate({ target: telegramLinks.userId, set: { tokenHash, expiresAt } });
    return { token, expiresAt };
  }

  async consumeTelegramLink(token: string, telegramId: string, username?: string): Promise<User> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return this.databaseService.connection.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`telegram-link:${telegramId}`}))`);
      const [link] = await tx.select().from(telegramLinks).where(eq(telegramLinks.tokenHash, tokenHash)).for("update");
      if (!link || link.expiresAt.getTime() < Date.now()) throw new UnauthorizedException("Посилання недійсне або застаріле. Створіть нове на сайті.");
      const [target] = await tx.select().from(users).where(eq(users.id, link.userId)).for("update");
      if (!target || (target.telegramId && target.telegramId !== telegramId)) throw new ConflictException("До цього акаунта вже під’єднано інший Telegram.");
      const [current] = await tx.select().from(users).where(eq(users.telegramId, telegramId)).for("update");
      if (current && current.id !== target.id) {
        const [car] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.ownerId, current.id)).limit(1);
        if (car || !current.email.endsWith("@telegram.local")) throw new ConflictException("Telegram уже пов’язаний з іншим акаунтом із даними. Автоматичне перенесення недоступне.");
        const access = await tx.execute(sql`SELECT state FROM vin_check_access WHERE owner_id = ${current.id} FOR UPDATE`);
        const previousState = access.rows[0]?.state;
        if (previousState === "in_progress" || previousState === "uncertain") throw new ConflictException("Спочатку завершіть або перевірте попередній VIN-запит у Telegram.");
        if (previousState === "used") {
          await tx.execute(sql`INSERT INTO vin_check_access (owner_id, state, source) VALUES (${target.id}, 'used', 'linked-account')
            ON CONFLICT (owner_id) DO UPDATE SET state = CASE WHEN vin_check_access.state = 'available' THEN 'used' ELSE vin_check_access.state END`);
        }
        // Old JWTs must not receive a fresh trial after their Telegram identity moves.
        await tx.execute(sql`INSERT INTO vin_check_access (owner_id, state, source) VALUES (${current.id}, 'used', 'retired-account')
          ON CONFLICT (owner_id) DO UPDATE SET state = 'used', claim_token = NULL`);
        await tx.execute(sql`UPDATE standalone_vin_checks SET owner_id = ${target.id} WHERE owner_id = ${current.id}`);
        await tx.update(users).set({ telegramId: null, telegramUsername: null, telegramPhotoUrl: null, updatedAt: new Date() }).where(eq(users.id, current.id));
      }
      const [linked] = await tx.update(users).set({ telegramId, telegramUsername: username ?? null, updatedAt: new Date() }).where(eq(users.id, target.id)).returning();
      await tx.delete(telegramLinks).where(eq(telegramLinks.tokenHash, tokenHash));
      return linked;
    });
  }

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
