import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dbAuthToken, dbUrl } from "../src/server/db/config.ts";

if (dbUrl.startsWith("file:")) mkdirSync("data", { recursive: true });

const db = drizzle(createClient({ url: dbUrl, authToken: dbAuthToken }));
await migrate(db, { migrationsFolder: "drizzle" });
console.log("✓ Base de dados atualizada");
