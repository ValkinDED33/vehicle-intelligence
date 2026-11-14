import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, inArray, isNotNull } from "drizzle-orm";
import { DatabaseService } from "../../common/database/database.service";
import { users } from "../identity/schemas/user.schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supportTelegramConfig(config: ConfigService) {
  return {
    token: config.get<string>("TELEGRAM_BOT_TOKEN")?.trim() ?? "",
    chatId: config.get<string>("SUPPORT_TELEGRAM_CHAT_ID")?.trim() ?? "",
  };
}

@Injectable()
export class SupportAccessService {
  constructor(private readonly config: ConfigService, private readonly db: DatabaseService) {}

  assertUser(userId: string): void {
    if (typeof userId !== "string" || !UUID.test(userId)) throw new UnauthorizedException("Invalid account identity");
  }

  isAdmin(userId: string): boolean {
    if (typeof userId !== "string" || !UUID.test(userId)) return false;
    return this.adminIds().includes(userId.toLowerCase());
  }

  private adminIds(): string[] {
    return [...new Set((this.config.get<string>("SUPPORT_ADMIN_USER_IDS") ?? "")
      .split(",").map(value => value.trim().toLowerCase()).filter(value => UUID.test(value)))];
  }

  assertAdmin(userId: string): void {
    this.assertUser(userId);
    if (!this.isAdmin(userId)) throw new ForbiddenException("Support administrator access required");
  }

  async recipients(): Promise<string[]> {
    const { chatId } = supportTelegramConfig(this.config);
    if (chatId) return [chatId];
    const ids = this.adminIds();
    if (!ids.length) return [];
    const rows = await this.db.connection.select({ telegramId: users.telegramId }).from(users)
      .where(and(inArray(users.id, ids), isNotNull(users.telegramId)));
    return [...new Set(rows.map(row => row.telegramId!.trim()).filter(Boolean))];
  }

  async notificationsConfigured(): Promise<boolean> {
    return this.config.get<string>("SUPPORT_NOTIFICATIONS_ENABLED") === "true"
      && !!supportTelegramConfig(this.config).token && (await this.recipients()).length > 0;
  }

  async access(userId: string) {
    this.assertUser(userId);
    return { isAdmin: this.isAdmin(userId), notificationsConfigured: await this.notificationsConfigured() };
  }
}
