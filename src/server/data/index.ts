import "server-only";
// Camada de acesso a dados. Regra de privacidade: TODAS as funções recebem o userId
// da sessão e filtram por dono. As páginas nunca consultam a BD diretamente.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Kind, Scope } from "@/lib/labels";
import { normalizeShared, sharedAmount } from "@/lib/split";
import type { DuplicateCandidate } from "../import/duplicates";
import { db, schema } from "../db";

const { accounts, budgets, categories, goals, investments, transactions, users } = schema;

/** Nome a mostrar: o que o utilizador escreveu, senão o do banco (já limpo). */
const displayName = sql<string>`coalesce(${transactions.customDescription}, ${transactions.description})`;

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
        description: displayName,
        accountName: accounts.name,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.ownerId, userId),
          alive(),
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

/** Movimentos não apagados. (Os apagados só servem para a deduplicação das importações e para restaurar.) */
const alive = () => isNull(transactions.deletedAt);

/** Só os movimentos que contam: Pessoal ou Casal, não apagados e que não estejam em suspenso por possível duplicado. */
const counts = () => and(inArray(transactions.scope, ["pessoal", "casal"]), isNull(transactions.duplicateOf), alive());

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
  /** true = mostrar só os apagados (para restaurar). */
  deleted?: boolean;
};

const original = alias(transactions, "original");
const originalAccount = alias(accounts, "original_account");

export async function myTransactions(userId: string, f: TxFilters = {}) {
  const where: (SQL | undefined)[] = [eq(transactions.ownerId, userId), f.deleted ? isNotNull(transactions.deletedAt) : alive()];
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
    where.push(
      or(
        like(transactions.description, q),
        like(transactions.customDescription, q),
        like(transactions.descriptionOriginal, q),
        like(transactions.notes, q),
      ),
    );
  }

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: displayName,
      descriptionOriginal: transactions.descriptionOriginal,
      amountCents: transactions.amountCents,
      feeCents: transactions.feeCents,
      scope: transactions.scope,
      kind: transactions.kind,
      sharedCents: transactions.sharedCents,
      bankType: transactions.bankType,
      bankDescription: transactions.description,
      customDescription: transactions.customDescription,
      notes: transactions.notes,
      balanceCents: transactions.balanceCents,
      bookedAt: transactions.bookedAt,
      counterparty: transactions.counterparty,
      originalAmountCents: transactions.originalAmountCents,
      originalCurrency: transactions.originalCurrency,
      updatedAt: transactions.updatedAt,
      deletedAt: transactions.deletedAt,
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
  // Ao deixar de ser Partilhado, a divisão deixa de fazer sentido.
  const extra = patch.scope && patch.scope !== "casal" ? { sharedCents: null } : {};
  const res = await db
    .update(transactions)
    .set({ needsReview: false, ...patch, ...extra, updatedAt: new Date().toISOString() })
    .where(and(eq(transactions.ownerId, userId), inArray(transactions.id, ids)))
    .run();
  return res.rowsAffected;
}

/**
 * Muda o nome a mostrar e a nota de um movimento do próprio. Nome vazio ou igual ao do banco = volta
 * ao do banco (o original nunca é apagado).
 */
export async function updateMyTxDetails(userId: string, id: string, d: { name: string | null; notes: string | null }) {
  const row = await db
    .select({ description: transactions.description })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ownerId, userId)))
    .get();
  if (!row) return;
  const name = d.name?.trim() || null;
  await db
    .update(transactions)
    .set({
      customDescription: name && name !== row.description ? name : null,
      notes: d.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(transactions.id, id), eq(transactions.ownerId, userId)))
    .run();
}

/**
 * Define quanto de um movimento Partilhado é mesmo da casa (o resto fica pessoal).
 * Só o dono o pode fazer e só em movimentos Partilhados. Devolve o valor guardado (null = tudo).
 */
export async function setMySharedPart(userId: string, id: string, cents: number | null) {
  const row = await db
    .select({ amountCents: transactions.amountCents, scope: transactions.scope })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ownerId, userId)))
    .get();
  if (!row || row.scope !== "casal") return undefined;
  const sharedCents = normalizeShared(row.amountCents, cents);
  await db
    .update(transactions)
    .set({ sharedCents, needsReview: false, updatedAt: new Date().toISOString() })
    .where(and(eq(transactions.id, id), eq(transactions.ownerId, userId)))
    .run();
  return sharedCents;
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
    .where(and(eq(transactions.ownerId, userId), alive(), isNotNull(transactions.duplicateOf)))
    .get();
  return row?.n ?? 0;
}

export async function countDeleted(userId: string) {
  const row = await db
    .select({ n: count() })
    .from(transactions)
    .where(and(eq(transactions.ownerId, userId), isNotNull(transactions.deletedAt)))
    .get();
  return row?.n ?? 0;
}

/** Apaga (esconde) movimentos do próprio. Continuam a impedir que a mesma linha volte a ser importada. */
export async function deleteMyTransactions(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const res = await db
    .update(transactions)
    .set({ deletedAt: now, needsReview: false, updatedAt: now })
    .where(and(eq(transactions.ownerId, userId), inArray(transactions.id, ids), alive()))
    .run();
  return res.rowsAffected;
}

export async function restoreMyTransactions(userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const res = await db
    .update(transactions)
    .set({ deletedAt: null, updatedAt: new Date().toISOString() })
    .where(and(eq(transactions.ownerId, userId), inArray(transactions.id, ids)))
    .run();
  return res.rowsAffected;
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
    .where(and(eq(transactions.ownerId, userId), alive(), eq(transactions.needsReview, true)))
    .get();
  return row?.n ?? 0;
}

/** Movimentos do próprio que contam como despesa/receita (Pessoal + Casal, fora de suspenso), para a Análise. */
export async function myCountedTransactions(userId: string) {
  return db
    .select({
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: displayName,
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
      description: displayName,
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

export type AccountBalance = {
  accountId: string;
  name: string;
  bank: string;
  balanceCents: number | null;
  date: string | null;
  source: "manual" | "extrato" | null;
  statementCents: number | null;
  statementDate: string | null;
};

/**
 * Saldo atual de cada conta: o escrito à mão, se for mais recente do que o último extrato;
 * senão o saldo da última linha do extrato.
 */
export async function myBalances(userId: string): Promise<AccountBalance[]> {
  const accs = await myAccounts(userId);
  const out: AccountBalance[] = [];
  for (const a of accs) {
    const row = await db
      .select({ balanceCents: transactions.balanceCents, date: transactions.date })
      .from(transactions)
      .where(and(eq(transactions.ownerId, userId), eq(transactions.accountId, a.id), isNotNull(transactions.balanceCents)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(1)
      .get();
    const st = row?.balanceCents != null ? { cents: row.balanceCents, date: row.date } : null;
    const manual = a.manualBalanceCents != null && a.manualBalanceDate ? { cents: a.manualBalanceCents, date: a.manualBalanceDate } : null;
    const useManual = manual && (!st || manual.date >= st.date.slice(0, 10));
    const pick = useManual ? manual : st;
    out.push({
      accountId: a.id,
      name: a.name,
      bank: a.bank,
      balanceCents: pick?.cents ?? null,
      date: pick?.date ?? null,
      source: useManual ? "manual" : st ? "extrato" : null,
      statementCents: st?.cents ?? null,
      statementDate: st?.date ?? null,
    });
  }
  return out;
}

/** Escreve (ou apaga, com null) o saldo atual de uma conta do próprio, com a data de hoje. */
export async function setMyAccountBalance(userId: string, accountId: string, cents: number | null, today: string) {
  await db
    .update(accounts)
    .set({ manualBalanceCents: cents, manualBalanceDate: cents == null ? null : today })
    .where(and(eq(accounts.id, accountId), eq(accounts.ownerId, userId)))
    .run();
}

/** Conta "Dinheiro" (carteira) do utilizador, criada na primeira vez que é precisa. */
export async function ensureCashAccount(userId: string) {
  const found = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ownerId, userId), eq(accounts.bank, "dinheiro")))
    .get();
  if (found) return found.id;
  const [row] = await db.insert(accounts).values({ ownerId: userId, bank: "dinheiro", name: "Dinheiro" }).returning({ id: accounts.id });
  return row.id;
}

export type ManualTx = {
  accountId: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
  scope: Scope;
  kind: Kind;
  sharedCents: number | null;
};

/** Movimento escrito à mão (ex.: pago em dinheiro). Só em contas do próprio. */
export async function addMyManualTransaction(userId: string, t: ManualTx) {
  const acc = await myAccount(userId, t.accountId);
  if (!acc) throw new Error("Conta desconhecida");
  await db
    .insert(transactions)
    .values({
      ownerId: userId,
      accountId: acc.id,
      date: t.date,
      descriptionOriginal: t.description,
      description: t.description,
      bankType: "manual",
      amountCents: t.amountCents,
      categoryId: t.categoryId,
      scope: t.scope,
      kind: t.kind,
      sharedCents: t.scope === "casal" ? normalizeShared(t.amountCents, t.sharedCents) : null,
      hash: `manual-${crypto.randomUUID()}`,
      needsReview: false,
    })
    .run();
}

/** Apaga um movimento manual do próprio (os importados não se apagam, para não voltarem na próxima importação). */
export async function deleteMyManualTransaction(userId: string, id: string) {
  await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.ownerId, userId), eq(transactions.bankType, "manual")))
    .run();
}

/* ---------- investimentos e objetivos ---------- */

export async function myInvestments(userId: string) {
  return db.select().from(investments).where(eq(investments.userId, userId)).orderBy(desc(investments.valueCents)).all();
}

export type InvestmentInput = { id?: string; name: string; type: (typeof investments.$inferInsert)["type"]; investedCents: number; valueCents: number };

export async function saveMyInvestment(userId: string, i: InvestmentInput) {
  const now = new Date().toISOString();
  const values = { name: i.name, type: i.type, investedCents: i.investedCents, valueCents: i.valueCents, updatedAt: now };
  if (i.id) await db.update(investments).set(values).where(and(eq(investments.id, i.id), eq(investments.userId, userId))).run();
  else await db.insert(investments).values({ userId, ...values }).run();
}

export async function deleteMyInvestment(userId: string, id: string) {
  await db.delete(investments).where(and(eq(investments.id, id), eq(investments.userId, userId))).run();
}

export async function myGoals(userId: string) {
  return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.createdAt)).all();
}

export type GoalInput = { id?: string; name: string; targetCents: number; savedCents: number; targetMonth: string | null };

export async function saveMyGoal(userId: string, g: GoalInput) {
  const now = new Date().toISOString();
  const values = { name: g.name, targetCents: g.targetCents, savedCents: g.savedCents, targetMonth: g.targetMonth, updatedAt: now };
  if (g.id) await db.update(goals).set(values).where(and(eq(goals.id, g.id), eq(goals.userId, userId))).run();
  else await db.insert(goals).values({ userId, ...values }).run();
}

/** Soma (ou tira, se negativo) um valor ao que já está poupado; nunca fica abaixo de zero. */
export async function addToMyGoal(userId: string, id: string, cents: number) {
  const g = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId))).get();
  if (!g) return;
  await db
    .update(goals)
    .set({ savedCents: Math.max(0, g.savedCents + cents), updatedAt: new Date().toISOString() })
    .where(eq(goals.id, id))
    .run();
}

export async function deleteMyGoal(userId: string, id: string) {
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId))).run();
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
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: displayName,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      kind: transactions.kind,
      amountCents: transactions.amountCents,
      sharedCents: transactions.sharedCents,
      paidBy: transactions.ownerId,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.scope, "casal"), isNull(transactions.duplicateOf), alive()))
    .orderBy(desc(transactions.date))
    .all();
  // amountCents passa a ser só a parte partilhada; o total original fica em fullAmountCents.
  return rows.map(({ sharedCents, ...r }) => ({
    ...r,
    amountCents: sharedAmount(r.amountCents, sharedCents),
    fullAmountCents: r.amountCents,
    partial: sharedCents != null,
  }));
}
