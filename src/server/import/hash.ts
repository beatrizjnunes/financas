import { createHash } from "node:crypto";
import type { ParsedRow } from "./types";

/**
 * Identificador estável de cada movimento para deduplicação.
 * Usa conta + data/hora + valor + descrição original. O saldo fica de fora de propósito:
 * nas exportações da Revolut, movimentos pendentes não têm saldo.
 * Se o mesmo ficheiro tiver movimentos idênticos, o n.º de ocorrência distingue-os
 * (o 2.º "Albert Heijn −1,00 €" à mesma hora não é confundido com o 1.º).
 */
export function hashRows(accountId: string, rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = [accountId, r.date, r.amountCents, r.descriptionOriginal.trim().toLowerCase()].join("|");
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return createHash("sha256").update(`${key}|${n}`).digest("hex");
  });
}
