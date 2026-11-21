"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { setMyBudgets } from "@/server/data";

const Input = z
  .array(z.object({ categoryId: z.string().min(1), cents: z.number().int().min(0).max(100_000_000).nullable() }))
  .max(200);

export async function saveBudgetsAction(input: unknown) {
  const user = await requireUser();
  await setMyBudgets(user.id, Input.parse(input));
  revalidatePath("/", "layout");
}
