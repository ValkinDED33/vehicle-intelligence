import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const env = config().parsed;

const databaseUrl = env?.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

function normalizeDatabaseUrl(value: string): string {
  const url = new URL(value);
  const sslMode = url.searchParams.get("sslmode");

  if (
    sslMode === "prefer" ||
    sslMode === "require" ||
    sslMode === "verify-ca"
  ) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

export default defineConfig({
  schema: "./src/modules/**/schemas/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizeDatabaseUrl(databaseUrl),
  },
  strict: true,
  verbose: true,
});
