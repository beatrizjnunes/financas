"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KINDS, SCOPES } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { markAllReviewed, resolveMyDuplicates, updateMyTransactions } from "@/server/data";

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
