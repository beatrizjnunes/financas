import { defineConfig } from "drizzle-kit";
import { dbAuthToken, dbUrl } from "./src/server/db/config";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: { url: dbUrl, authToken: dbAuthToken },
});
