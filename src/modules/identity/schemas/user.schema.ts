import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  email: varchar("email", { length: 320 }).notNull().unique(),

  passwordHash: varchar("password_hash", { length: 255 }).notNull(),

  telegramId: varchar("telegram_id", { length: 32 }).unique(),

  telegramUsername: varchar("telegram_username", { length: 64 }),

  telegramPhotoUrl: varchar("telegram_photo_url", { length: 2048 }),

  displayName: varchar("display_name", { length: 120 }),

  country: varchar("country", { length: 2 }).notNull().default("PL"),

  language: varchar("language", { length: 5 }).notNull().default("ru"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
