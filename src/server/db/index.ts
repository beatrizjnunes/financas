import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local: ficheiro SQLite em data/. Produção (Vercel): Turso via DATABASE_URL + DATABASE_AUTH_TOKEN.
const client = createClient({
  url: process.env.DATABASE_URL || "file:data/financas.db",
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

export const db = drizzle(client, { schema });
export { schema };
