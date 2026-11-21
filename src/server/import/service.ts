import "server-only";
import { db, schema } from "../db";
import { existingHashes, listCategories, myAccount, myDuplicateCandidates, peopleNames } from "../data";
import type { Kind, Scope } from "@/lib/labels";
import { BANK_LABEL } from "@/lib/labels";
import { suggestCategoryName, suggestScope } from "./classify";
import { candidateWindow, findPossibleDuplicate } from "./duplicates";
import { hashRows } from "./hash";
import { detectParser, parserForBank } from "./parsers";
import { type ParsedRow, ParseError, type SkippedRow } from "./types";

export type PreviewRow = {
  key: string;
  date: string;
  description: string;
  descriptionOriginal: string;
  amountCents: number;
  feeCents: number;
  categoryId: string | null;
  scope: Scope;
  kind: Kind;
  duplicate: boolean;
  /** Movimento já gravado que parece ser o mesmo (mesmo valor, mesma hora). Entra em suspenso. */
  possibleDuplicate: { date: string; description: string; accountName: string } | null;
};

export type Preview = { rows: PreviewRow[]; skipped: SkippedRow[]; parser: string };

/** Para cada movimento novo, o já gravado (de qualquer conta do utilizador) que parece ser o mesmo. */
async function possibleDuplicates(userId: string, rows: ParsedRow[], isNew: boolean[]) {
  const fresh = rows.filter((_, i) => isNew[i]);
  if (!fresh.length) return rows.map(() => null);
  const candidates = await myDuplicateCandidates(
    userId,
    fresh.map((r) => r.amountCents),
    candidateWindow(fresh.map((r) => r.date)),
  );
  return rows.map((r, i) => (isNew[i] ? findPossibleDuplicate(r, candidates) : null));
}

/** Lê o ficheiro, deteta duplicados e sugere âmbito/categoria. Não grava nada. */
export async function buildPreview(userId: string, accountId: string, content: string): Promise<Preview> {
  const account = await myAccount(userId, accountId);
  if (!account) throw new ParseError("Conta não encontrada.");

  const expected = parserForBank(account.bank);
  if (!expected) throw new ParseError(`A importação de ${BANK_LABEL[account.bank]} ainda não está disponível.`);
  if (!expected.detect(content)) {
    const other = detectParser(content);
    throw new ParseError(
      other
        ? `Este ficheiro parece ser ${other.ofBank}, mas escolheste a conta ${account.name}.`
        : `Este ficheiro não parece ser um extrato ${expected.ofBank}. Exporta-o em CSV a partir da app ${expected.ofBank}.`,
    );
  }

  const { rows, skipped } = expected.parse(content);
  if (!rows.length) throw new ParseError("O ficheiro não tem movimentos concluídos para importar.");

  const hashes = hashRows(account.id, rows);
  const existing = await existingHashes(account.id, hashes);
  const maybeDup = await possibleDuplicates(userId, rows, hashes.map((h) => !existing.has(h)));
  const people = await peopleNames(userId);
  const catByName = new Map((await listCategories()).map((c) => [c.name, c.id]));

  const preview = rows.map((r, i): PreviewRow => {
    const scope = suggestScope(r, people);
    const cat = suggestCategoryName(r, scope);
    return {
      key: hashes[i],
      date: r.date,
      description: r.description,
      descriptionOriginal: r.descriptionOriginal,
      amountCents: r.amountCents,
      feeCents: r.feeCents,
      categoryId: cat ? (catByName.get(cat) ?? null) : null,
      scope,
      kind: "variavel",
      duplicate: existing.has(hashes[i]),
      possibleDuplicate: maybeDup[i]
        ? { date: maybeDup[i]!.date, description: maybeDup[i]!.description, accountName: maybeDup[i]!.accountName }
        : null,
    };
  });
  preview.sort((a, b) => b.date.localeCompare(a.date));
  return { rows: preview, skipped, parser: expected.id };
}

export type RowEdit = { scope: Scope; kind: Kind; categoryId: string | null };

/**
 * Volta a ler o ficheiro no servidor (não confiamos em valores vindos do browser),
 * aplica as escolhas feitas na revisão e grava só os movimentos novos.
 */
export async function commitImport(
  userId: string,
  accountId: string,
  fileName: string,
  content: string,
  edits: Record<string, RowEdit>,
) {
  const account = await myAccount(userId, accountId);
  if (!account) throw new ParseError("Conta não encontrada.");
  const parser = parserForBank(account.bank);
  if (!parser?.detect(content)) throw new ParseError("O ficheiro mudou entretanto. Volta a carregá-lo.");

  const { rows } = parser.parse(content);
  const hashes = hashRows(account.id, rows);
  const existing = await existingHashes(account.id, hashes);
  const maybeDup = await possibleDuplicates(userId, rows, hashes.map((h) => !existing.has(h)));
  const validCategories = new Set((await listCategories()).map((c) => c.id));

  const toInsert = rows
    .map((r, i) => ({ r, hash: hashes[i], edit: edits[hashes[i]], duplicateOf: maybeDup[i]?.id ?? null }))
    .filter(({ hash, edit }) => !existing.has(hash) && edit);

  const imported = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({
        accountId: account.id,
        userId,
        fileName,
        parser: parser.id,
        rowCount: rows.length,
        importedCount: toInsert.length,
        duplicateCount: rows.length - toInsert.length,
      })
      .returning({ id: schema.importBatches.id });

    for (let i = 0; i < toInsert.length; i += 100) {
      const values = toInsert.slice(i, i + 100).map(({ r, hash, edit, duplicateOf }) => ({
        ownerId: userId,
        accountId: account.id,
        batchId: batch.id,
        date: r.date,
        bookedAt: r.bookedAt,
        descriptionOriginal: r.descriptionOriginal,
        description: r.description,
        counterparty: r.counterparty,
        bankType: r.bankType,
        amountCents: r.amountCents,
        feeCents: r.feeCents,
        originalAmountCents: r.originalAmountCents,
        originalCurrency: r.originalCurrency,
        balanceCents: r.balanceCents,
        categoryId: edit.categoryId && validCategories.has(edit.categoryId) ? edit.categoryId : null,
        scope: edit.scope,
        kind: edit.kind,
        hash,
        duplicateOf,
      }));
      await tx.insert(schema.transactions).values(values).onConflictDoNothing();
    }
    return toInsert.length;
  });

  const suspended = toInsert.filter((t) => t.duplicateOf).length;
  return { imported, duplicates: rows.length - toInsert.length, suspended };
}
