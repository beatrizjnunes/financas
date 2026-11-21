import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "./db";

const COOKIE = "sessao";
const MAX_AGE_DAYS = 30;

// Hash real para comparar quando o utilizador não existe (tempo de resposta igual).
const DUMMY_HASH = bcrypt.hashSync("nao-existe", 10);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = { id: string; username: string; displayName: string };

export async function login(username: string, password: string): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.username, username.trim().toLowerCase()) });
  // Compara sempre, mesmo sem utilizador, para não revelar quais os nomes que existem.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return false;

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + MAX_AGE_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: sha256(token), userId: user.id, expiresAt: expires.toISOString() });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sha256(token)))
    .get();
  if (!row || new Date(row.expiresAt) < new Date()) return null;
  return { id: row.id, username: row.username, displayName: row.displayName };
});

/** Usar no início de cada página e server action protegida. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
