import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "../../identity/schemas/user.schema";

export const vinAccess = pgTable("vin_check_access", {
  ownerId: uuid("owner_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  state: varchar("state", { length: 16 }).notNull().default("available"),
  claimToken: uuid("claim_token"),
  claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
  source: varchar("source", { length: 100 }),
  vin: varchar("vin", { length: 17 }),
});
