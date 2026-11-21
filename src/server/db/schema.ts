import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(sql`(datetime('now'))`);

export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Nomes com que o banco identifica esta pessoa (JSON string[]), para detetar transferências. */
  bankNames: text("bank_names", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: createdAt(),
});

export const sessions = sqliteTable("sessions", {
  /** sha256 do token do cookie — o token em si nunca é guardado. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  /** "dinheiro" = carteira, para despesas pagas em notas (só movimentos manuais). */
  bank: text("bank", { enum: ["ing", "revolut", "caixa", "dinheiro"] }).notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["corrente", "poupanca", "cartao"] }).notNull().default("corrente"),
  currency: text("currency").notNull().default("EUR"),
  /** Saldo escrito à mão (vale mais do que o do extrato se for mais recente). */
  manualBalanceCents: integer("manual_balance_cents"),
  manualBalanceDate: text("manual_balance_date"),
  createdAt: createdAt(),
});

export const categories = sqliteTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  groupName: text("group_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const importBatches = sqliteTable("import_batches", {
  id: id(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  userId: text("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  parser: text("parser").notNull(),
  rowCount: integer("row_count").notNull(),
  importedCount: integer("imported_count").notNull(),
  duplicateCount: integer("duplicate_count").notNull(),
  createdAt: createdAt(),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    /** Redundante com accounts.owner_id, mas torna o filtro de privacidade explícito em cada consulta. */
    ownerId: text("owner_id").notNull().references(() => users.id),
    accountId: text("account_id").notNull().references(() => accounts.id),
    batchId: text("batch_id").references(() => importBatches.id),
    /** Data/hora local da operação, "YYYY-MM-DD HH:MM:SS". */
    date: text("date").notNull(),
    bookedAt: text("booked_at"),
    descriptionOriginal: text("description_original").notNull(),
    description: text("description").notNull(),
    /** Nome dado pelo utilizador (null = usar `description`). O nome do banco fica sempre guardado. */
    customDescription: text("custom_description"),
    counterparty: text("counterparty"),
    bankType: text("bank_type"),
    /** Valor líquido em cêntimos de EUR (já com comissões descontadas). */
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    originalAmountCents: integer("original_amount_cents"),
    originalCurrency: text("original_currency"),
    balanceCents: integer("balance_cents"),
    categoryId: text("category_id").references(() => categories.id),
    scope: text("scope", { enum: ["pessoal", "casal", "interna", "entre_nos", "ignorar"] })
      .notNull()
      .default("pessoal"),
    kind: text("kind", { enum: ["fixa", "variavel", "pontual"] }).notNull().default("variavel"),
    /**
     * Parte partilhada (cêntimos, positivo) quando só uma parte de um movimento Partilhado é da casa.
     * null = o valor todo. O resto conta como pessoal de quem pagou.
     */
    sharedCents: integer("shared_cents"),
    hash: text("hash").notNull(),
    /**
     * Possível duplicado de outro movimento (mesmo valor, mesma hora). Enquanto estiver preenchido
     * o movimento fica em suspenso e não entra em nenhum total; o dono confirma se é ou não duplicado.
     */
    duplicateOf: text("duplicate_of"),
    /** Fica a true quando é importado; passa a false quando o dono o revê ou edita. */
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    /**
     * Apagado pelo dono: deixa de aparecer e de contar, mas a linha fica para a importação seguinte
     * reconhecer o movimento (pelo hash) e não o voltar a criar. Pode ser restaurado.
     */
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at"),
  },
  (t) => [
    uniqueIndex("transactions_account_hash").on(t.accountId, t.hash),
    index("transactions_owner_date").on(t.ownerId, t.date),
    index("transactions_scope_date").on(t.scope, t.date),
  ],
);

/** Orçamento mensal de cada pessoa por categoria (só existe linha para as categorias com limite). */
export const budgets = sqliteTable(
  "budgets",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    updatedAt: text("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

/** Investimentos pessoais (ações, ETF, PPR, cripto…). Valores atualizados à mão. */
export const investments = sqliteTable("investments", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["acoes", "etf", "ppr", "cripto", "deposito", "outro"] }).notNull().default("outro"),
  /** Total que lá se pôs (custo). */
  investedCents: integer("invested_cents").notNull(),
  /** Quanto vale hoje. */
  valueCents: integer("value_cents").notNull(),
  updatedAt: text("updated_at"),
  createdAt: createdAt(),
});

/** Objetivos de poupança (férias, fundo de emergência, carro…). */
export const goals = sqliteTable("goals", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  savedCents: integer("saved_cents").notNull().default(0),
  /** "AAAA-MM" opcional: até quando. */
  targetMonth: text("target_month"),
  updatedAt: text("updated_at"),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
