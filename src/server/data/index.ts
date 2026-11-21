import "server-only";
// Camada de acesso a dados. Regra de privacidade: TODAS as funções recebem o userId
// da sessão e filtram por dono. As páginas nunca consultam a BD diretamente.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Kind, Scope } from "@/lib/labels";
import type { DuplicateCandidate } from "../import/duplicates";
import { db, schema } from "../db";

const { accounts, budgets, categories, transactions, users } = schema;

export async function myAccounts(userId: string) {
  return db.select().from(accounts).where(eq(accounts.ownerId, userId)).orderBy(asc(accounts.bank)).all();
}

export async function myAccount(userId: string, accountId: string) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.ownerId, userId)))
    .get();
}

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder)).all();
}

/** Nomes do próprio e do(s) parceiro(s), tal como aparecem nos extratos. */
export async function peopleNames(userId: string) {
  const all = await db.select({ id: users.id, bankNames: users.bankNames }).from(users).all();
  return {
    ownNames: all.filter((u) => u.id === userId).flatMap((u) => u.bankNames),
    partnerNames: all.filter((u) => u.id !== userId).flatMap((u) => u.bankNames),
  };
}

export async function existingHashes(accountId: string, hashes: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const rows = await db
      .select({ hash: transactions.hash })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), inArray(transactions.hash, chunk)))
      .all();
    rows.forEach((r) => found.add(r.hash));
  }
  return found;
}

/** Movimentos já gravados do utilizador (em qualquer conta) com estes valores, para procurar duplicados prováveis. */
export async function myDuplicateCandidates(
  userId: string,
  amounts: number[],
  window: { from: string; to: string },
): Promise<DuplicateCandidate[]> {
  const unique = [...new Set(amounts)];
  const out: DuplicateCandidate[] = [];
  for (let i = 0; i < unique.length; i += 500) {
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.description,
        accountName: accounts.name,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.ownerId, userId),
          inArray(transactions.amountCents, unique.slice(i, i + 500)),
          gte(transactions.date, window.from),
          lte(transactions.date, window.to),
        ),
      )
      .all();
    out.push(...rows);
  }
  return out;
}

/** Só os movimentos que contam: Pessoal ou Casal, e que não estejam em suspenso por possível duplicado. */
const counts = () => and(inArray(transactions.scope, ["pessoal", "casal"]), isNull(transactions.duplicateOf));

export type TxFilters = {
  q?: string;
  accountId?: string;
  categoryId?: string;
  scope?: Scope | "contam";
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  review?: boolean;
  suspended?: boolean;
};

const original = alias(transactions, "original");
const originalAccount = alias(accounts, "original_account");

export async function myTransactions(userId: string, f: TxFilters = {}) {
  const where: (SQL | undefined)[] = [eq(transactions.ownerId, userId)];
  if (f.accountId) where.push(eq(transactions.accountId, f.accountId));
  if (f.categoryId === "sem") where.push(isNull(transactions.categoryId));
  else if (f.categoryId) where.push(eq(transactions.categoryId, f.categoryId));
  if (f.scope === "contam") where.push(counts());
  else if (f.scope) where.push(eq(transactions.scope, f.scope));
  if (f.from) where.push(gte(transactions.date, f.from));
  if (f.to) where.push(lte(transactions.date, `${f.to} 23:59:59`));
  // Filtro de valor pelo valor absoluto (ex.: "entre 10 e 50 €", seja despesa ou receita).
  if (f.min != null) where.push(or(gte(transactions.amountCents, f.min), lte(transactions.amountCents, -f.min)));
  if (f.max != null) where.push(and(lte(transactions.amountCents, f.max), gte(transactions.amountCents, -f.max)));
  if (f.review) where.push(eq(transactions.needsReview, true));
  if (f.suspended) where.push(isNotNull(transactions.duplicateOf));
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    where.push(or(like(transactions.description, q), like(transactions.descriptionOriginal, q), like(transactions.notes, q)));
  }

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      descriptionOriginal: transactions.descriptionOriginal,
      amountCents: transactions.amountCents,
      feeCents: transactions.feeCents,
      scope: transactions.scope,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      needsReview: transactions.needsReview,
      accountId: transactions.accountId,
      accountName: accounts.name,
      bank: accounts.bank,
      duplicateOf: transactions.duplicateOf,
      original: {
        date: original.date,
        description: original.description,
        accountName: originalAccount.name,
      },
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(original, eq(original.id, transactions.duplicateOf))
    .leftJoin(originalAccount, eq(originalAccount.id, original.accountId))
    .where(and(...where))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .all();
}

export type TxPatch = { scope?: Scope; kind?: Kind; categoryId?: string | null; needsReview?: boolean };

/**
 * Atualiza movimentos — só os do próprio utilizador (os ids de outros são ignorados).
 * Editar um movimento conta como tê-lo revisto.
 */
export async function updateMyTransactions(userId: string, ids: string[], patch: TxPatch) {
  if (!ids.length) return 0;
  const res = await db
    .update(transactions)
    .set({ needsReview: false, ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(transactions.ownerId, userId), inArray(transactions.id, ids)))
    .run();
  return res.rowsAffected;
}

/**
 * Resolve possíveis duplicados. Se for mesmo duplicado fica guardado como Ignorar (para não
 * voltar a entrar numa importação futura); se não for, passa a contar normalmente.
 */
export async function resolveMyDuplicates(userId: string, ids: string[], isDuplicate: boolean) {
  if (!ids.length) return 0;
  const res = await db
    .update(transactions)
    .set({
      duplicateOf: null,
      updatedAt: new Date().toISOString(),
      ...(isDuplicate ? { scope: "ignorar" as const, needsReview: false } : {}),
    })
    .where(and(eq(transactions.ownerId, userId), inArray(transactions.id, ids), isNotNull(transactions.duplicateOf)))
    .run();
  return res.rowsAffected;
}

export async function countSuspended(userId: string) {
  const row = await db
    .select({ n: count() })
    .from(transactions)
    .where(and(eq(transactions.ownerId, userId), isNotNull(transactions.duplicateOf)))
    .get();
  return row?.n ?? 0;
}

export async function hasAnyTransactions(userId: string) {
  const row = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.ownerId, userId)).limit(1).get();
  return !!row;
}

export async function markAllReviewed(userId: string) {
  await db
    .update(transactions)
    .set({ needsReview: false })
    .where(and(eq(transactions.ownerId, userId), eq(transactions.needsReview, true)))
    .run();
}

export async function countToReview(userId: string) {
  const row = await db
    .select({ n: count() })
    .from(transactions)
    .where(and(eq(transactions.ownerId, userId), eq(transactions.needsReview, true)))
    .get();
  return row?.n ?? 0;
}

/** Movimentos do próprio que contam como despesa/receita (Pessoal + Casal, fora de suspenso), para a Análise. */
export async function myCountedTransactions(userId: string) {
  return db
    .select({
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      kind: transactions.kind,
      scope: transactions.scope,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.ownerId, userId), counts()))
    .orderBy(asc(transactions.date))
    .all();
}

/** Últimos movimentos que contam, para o Resumo. */
export async function myRecentTransactions(userId: string, limit = 6) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      categoryName: categories.name,
      scope: transactions.scope,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.ownerId, userId), counts()))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .all();
}

/** Saldo mais recente de cada conta do utilizador, tirado da última linha do extrato com saldo. */
export async function myBalances(userId: string) {
  const accs = await myAccounts(userId);
  const out: { accountId: string; name: string; balanceCents: number; date: string }[] = [];
  for (const a of accs) {
    const row = await db
      .select({ balanceCents: transactions.balanceCents, date: transactions.date })
      .from(transactions)
      .where(and(eq(transactions.ownerId, userId), eq(transactions.accountId, a.id), isNotNull(transactions.balanceCents)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(1)
      .get();
    if (row?.balanceCents != null) out.push({ accountId: a.id, name: a.name, balanceCents: row.balanceCents, date: row.date });
  }
  return out;
}

export async function myBudgets(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ categoryId: budgets.categoryId, amountCents: budgets.amountCents })
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .all();
  return new Map(rows.map((r) => [r.categoryId, r.amountCents]));
}

/** Define (ou apaga, com null/0) vários orçamentos do próprio utilizador. Ignora categorias inexistentes. */
export async function setMyBudgets(userId: string, items: { categoryId: string; cents: number | null }[]) {
  if (!items.length) return;
  const valid = new Set(
    (
      await db
        .select({ id: categories.id })
        .from(categories)
        .where(inArray(categories.id, items.map((i) => i.categoryId)))
        .all()
    ).map((c) => c.id),
  );
  const now = new Date().toISOString();
  for (const i of items) {
    if (!valid.has(i.categoryId)) continue;
    if (!i.cents || i.cents <= 0) {
      await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, i.categoryId))).run();
    } else {
      await db
        .insert(budgets)
        .values({ userId, categoryId: i.categoryId, amountCents: i.cents, updatedAt: now })
        .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId], set: { amountCents: i.cents, updatedAt: now } })
        .run();
    }
  }
}

export async function listPeople() {
  return db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .orderBy(asc(users.username))
    .all();
}

/**
 * Vista partilhada do casal. Devolve movimentos de AMBOS, mas só os marcados como Casal
 * e só os campos necessários (sem conta, saldo, descrição original nem notas). Os que estão em suspenso
 * por possível duplicado ficam de fora até o dono os confirmar.
 */
export async function coupleTransactions() {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      kind: transactions.kind,
      amountCents: transactions.amountCents,
      paidBy: transactions.ownerId,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.scope, "casal"), isNull(transactions.duplicateOf)))
    .orderBy(desc(transactions.date))
    .all();
}
