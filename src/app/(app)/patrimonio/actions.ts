"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVESTMENT_TYPES } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { addToMyGoal, deleteMyGoal, deleteMyInvestment, saveMyGoal, saveMyInvestment, setMyAccountBalance } from "@/server/data";

const cents = z.number().int().min(0).max(10_000_000_000);
const done = () => revalidatePath("/", "layout");

export async function setBalanceAction(input: unknown) {
  const user = await requireUser();
  const { accountId, cents: c } = z.object({ accountId: z.string().min(1), cents: z.number().int().max(10_000_000_000).nullable() }).parse(input);
  await setMyAccountBalance(user.id, accountId, c, new Date().toISOString().slice(0, 10));
  done();
}

export async function saveInvestmentAction(input: unknown) {
  const user = await requireUser();
  const i = z
    .object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), type: z.enum(INVESTMENT_TYPES), investedCents: cents, valueCents: cents })
    .parse(input);
  await saveMyInvestment(user.id, i);
  done();
}

export async function deleteInvestmentAction(id: unknown) {
  const user = await requireUser();
  await deleteMyInvestment(user.id, z.string().min(1).parse(id));
  done();
}

export async function saveGoalAction(input: unknown) {
  const user = await requireUser();
  const g = z
    .object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(80),
      targetCents: cents.min(1),
      savedCents: cents,
      targetMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    })
    .parse(input);
  await saveMyGoal(user.id, g);
  done();
}

export async function addToGoalAction(input: unknown) {
  const user = await requireUser();
  const { id, cents: c } = z.object({ id: z.string().min(1), cents: z.number().int().min(-10_000_000_000).max(10_000_000_000) }).parse(input);
  await addToMyGoal(user.id, id, c);
  done();
}

export async function deleteGoalAction(id: unknown) {
  const user = await requireUser();
  await deleteMyGoal(user.id, z.string().min(1).parse(id));
  done();
}
