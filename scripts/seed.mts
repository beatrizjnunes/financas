// Cria (ou atualiza) os 2 utilizadores, as contas e as categorias. Pode correr várias vezes.
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { DEFAULT_CATEGORIES } from "../src/server/db/categories.ts";
import { dbAuthToken, dbUrl } from "../src/server/db/config.ts";
import * as schema from "../src/server/db/schema.ts";

const db = drizzle(createClient({ url: dbUrl, authToken: dbAuthToken }), { schema });

type Bank = "ing" | "revolut" | "caixa";
const PEOPLE: { username: string; displayName: string; env: string; accounts: { bank: Bank; name: string }[] }[] = [
  { username: "ivo", displayName: "Ivo", env: "IVO", accounts: [{ bank: "ing", name: "ING" }, { bank: "revolut", name: "Revolut" }] },
  { username: "bea", displayName: "Bea", env: "BEA", accounts: [{ bank: "caixa", name: "Caixa" }, { bank: "revolut", name: "Revolut" }] },
];

const list = (v?: string) => (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);

for (const p of PEOPLE) {
  const password = process.env[`${p.env}_PASSWORD`];
  if (!password || password.length < 10) throw new Error(`Define ${p.env}_PASSWORD no .env (mín. 10 caracteres).`);
  const bankNames = list(process.env[`${p.env}_BANK_NAMES`]);
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db.query.users.findFirst({ where: eq(schema.users.username, p.username) });
  const userId =
    existing?.id ??
    (await db.insert(schema.users).values({ username: p.username, displayName: p.displayName, passwordHash, bankNames }).returning())[0].id;
  if (existing) await db.update(schema.users).set({ passwordHash, bankNames }).where(eq(schema.users.id, userId));

  for (const a of p.accounts) {
    const has = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.ownerId, userId), eq(schema.accounts.bank, a.bank)),
    });
    if (!has) await db.insert(schema.accounts).values({ ownerId: userId, bank: a.bank, name: a.name });
  }
  console.log(`✓ ${p.displayName}: ${p.accounts.map((a) => a.name).join(" + ")}${bankNames.length ? ` · nomes no banco: ${bankNames.join(", ")}` : ""}`);
}

let order = 0;
for (const g of DEFAULT_CATEGORIES) {
  for (const name of g.names) {
    await db.insert(schema.categories).values({ name, groupName: g.group, sortOrder: order++ }).onConflictDoNothing();
  }
}
console.log(`✓ ${order} categorias`);
