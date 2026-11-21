import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { dbAuthToken, dbUrl } from "./config";
import * as schema from "./schema";

const client = createClient({ url: dbUrl, authToken: dbAuthToken });

export const db = drizzle(client, { schema });
export { schema };
