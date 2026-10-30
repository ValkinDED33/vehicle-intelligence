import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./user.schema";

export const telegramLinks = pgTable("telegram_links", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});
