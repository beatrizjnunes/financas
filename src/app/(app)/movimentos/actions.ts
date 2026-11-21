"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KINDS, SCOPES } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import {
  addMyManualTransaction,
  deleteMyManualTransaction,
  deleteMyTransactions,
  restoreMyTransactions,
  ensureCashAccount,
  markAllReviewed,
  resolveMyDuplicates,
  setMySharedPart,
  updateMyTransactions,
  updateMyTxDetails,
} from "@/server/data";

const Input = z.object({
  ids: z.array(z.string()).min(1).max(5000),
  patch: z
    .object({
      scope: z.enum(SCOPES),
      kind: z.enum(KINDS),
      categoryId: z.string().nullable(),
      needsReview: z.literal(false),
    })
    .partial(),
});

export async function updateTransactionsAction(input: unknown) {
  const user = await requireUser();
  const { ids, patch } = Input.parse(input);
  await updateMyTransactions(user.id, ids, patch);
  revalidatePath("/", "layout");
}

const Shared = z.object({ id: z.string().min(1), cents: z.number().int().min(0).max(100_000_000).nullable() });

/** Parte partilhada de um movimento (null = tudo). Devolve o valor guardado. */
export async function setSharedPartAction(input: unknown) {
  const user = await requireUser();
  const { id, cents } = Shared.parse(input);
  const saved = await setMySharedPart(user.id, id, cents);
  revalidatePath("/", "layout");
  return saved ?? null;
}

const Ids = z.array(z.string().min(1)).min(1).max(5000);

export async function deleteTransactionsAction(ids: unknown) {
  const user = await requireUser();
  await deleteMyTransactions(user.id, Ids.parse(ids));
  revalidatePath("/", "layout");
}

export async function restoreTransactionsAction(ids: unknown) {
  const user = await requireUser();
  await restoreMyTransactions(user.id, Ids.parse(ids));
  revalidatePath("/", "layout");
}

const Details = z.object({
  id: z.string().min(1),
  name: z.string().max(120).nullable(),
  notes: z.string().max(1000).nullable(),
});

/** Nome personalizado e nota de um movimento. */
export async function updateDetailsAction(input: unknown) {
  const user = await requireUser();
  const { id, ...d } = Details.parse(input);
  await updateMyTxDetails(user.id, id, d);
  revalidatePath("/", "layout");
}

const Manual = z.object({
  /** id de uma conta do próprio, ou "dinheiro" para a carteira (criada se ainda não existir). */
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 100_000_000),
  categoryId: z.string().nullable(),
  scope: z.enum(["pessoal", "casal"]),
  kind: z.enum(KINDS),
  sharedCents: z.number().int().min(0).nullable(),
});

export async function addManualTransactionAction(input: unknown) {
  const user = await requireUser();
  const t = Manual.parse(input);
  const accountId = t.accountId === "dinheiro" ? await ensureCashAccount(user.id) : t.accountId;
  await addMyManualTransaction(user.id, { ...t, accountId, date: `${t.date} 12:00:00` });
  revalidatePath("/", "layout");
}

export async function deleteManualTransactionAction(id: unknown) {
  const user = await requireUser();
  await deleteMyManualTransaction(user.id, z.string().min(1).parse(id));
  revalidatePath("/", "layout");
}

const Resolve = z.object({ ids: z.array(z.string()).min(1).max(5000), isDuplicate: z.boolean() });

export async function resolveDuplicatesAction(input: unknown) {
  const user = await requireUser();
  const { ids, isDuplicate } = Resolve.parse(input);
  await resolveMyDuplicates(user.id, ids, isDuplicate);
  revalidatePath("/", "layout");
}

export async function markAllReviewedAction() {
  const user = await requireUser();
  await markAllReviewed(user.id);
  revalidatePath("/", "layout");
}
