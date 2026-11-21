import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  bank: text("bank", { enum: ["ing", "revolut", "caixa"] }).notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["corrente", "poupanca", "cartao"] }).notNull().default("corrente"),
  currency: text("currency").notNull().default("EUR"),
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
    hash: text("hash").notNull(),
    /**
     * Possível duplicado de outro movimento (mesmo valor, mesma hora). Enquanto estiver preenchido
     * o movimento fica em suspenso e não entra em nenhum total; o dono confirma se é ou não duplicado.
     */
    duplicateOf: text("duplicate_of"),
    /** Fica a true quando é importado; passa a false quando o dono o revê ou edita. */
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: text("updated_at"),
  },
  (t) => [
    uniqueIndex("transactions_account_hash").on(t.accountId, t.hash),
    index("transactions_owner_date").on(t.ownerId, t.date),
    index("transactions_scope_date").on(t.scope, t.date),
  ],
);

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
