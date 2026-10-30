import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../../identity/schemas/user.schema";
import type { ConversationState } from "../telegram-conversation.types";

export const telegramConversations = pgTable("telegram_conversations", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<ConversationState>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  lockToken: uuid("lock_token"),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
});
