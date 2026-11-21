"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KINDS, SCOPES } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { buildPreview, commitImport, type Preview } from "@/server/import/service";
import { ParseError } from "@/server/import/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_BYTES = 4_000_000;

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ParseError) return { ok: false, error: e.message };
  if (e instanceof Error && e.message.startsWith("Valor inválido")) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Algo correu mal ao ler o ficheiro. Tenta outra vez." };
}

export async function previewAction(accountId: string, content: string): Promise<Result<Preview>> {
  const user = await requireUser();
  if (content.length > MAX_BYTES) return { ok: false, error: "O ficheiro é demasiado grande (máx. 4 MB)." };
  try {
    return { ok: true, data: await buildPreview(user.id, accountId, content) };
  } catch (e) {
    return fail(e);
  }
}

const Edits = z.record(
  z.string(),
  z.object({ scope: z.enum(SCOPES), kind: z.enum(KINDS), categoryId: z.string().nullable() }),
);

export async function confirmAction(
  accountId: string,
  fileName: string,
  content: string,
  edits: unknown,
): Promise<Result<{ imported: number; duplicates: number; suspended: number }>> {
  const user = await requireUser();
  const parsed = Edits.safeParse(edits);
  if (!parsed.success) return { ok: false, error: "Dados de revisão inválidos." };
  try {
    const res = await commitImport(user.id, accountId, fileName.slice(0, 200), content, parsed.data);
    revalidatePath("/movimentos");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}
