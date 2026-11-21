import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashRows } from "@/server/import/hash";
import { revolutParser } from "@/server/import/parsers/revolut";
import type { ParsedRow } from "@/server/import/types";

const { rows } = revolutParser.parse(readFileSync(new URL("./fixtures/revolut.csv", import.meta.url), "utf8"));

/** Simula importações sucessivas: devolve quantas linhas novas entrariam de cada vez. */
function importSequence(files: ParsedRow[][], account = "acc-1") {
  const db = new Set<string>();
  return files.map((f) => {
    const fresh = hashRows(account, f).filter((h) => !db.has(h));
    fresh.forEach((h) => db.add(h));
    return fresh.length;
  });
}

describe("deduplicação", () => {
  it("importar o mesmo ficheiro duas vezes não duplica nada", () => {
    expect(importSequence([rows, rows])).toEqual([56, 0]);
  });

  it("extratos sobrepostos só acrescentam o que falta", () => {
    const set = rows.slice(0, 30);
    const out = rows.slice(20); // sobrepõe 10 linhas
    expect(importSequence([set, out])).toEqual([30, 26]);
  });

  it("a mesma operação noutra conta não é duplicado", () => {
    expect(hashRows("acc-1", rows.slice(0, 1))).not.toEqual(hashRows("acc-2", rows.slice(0, 1)));
  });

  it("dois movimentos idênticos no mesmo ficheiro ficam os dois", () => {
    const twin = { ...rows[0] };
    const file = [rows[0], twin];
    expect(new Set(hashRows("acc-1", file)).size).toBe(2);
    // …e reimportar o mesmo ficheiro continua a não duplicar
    expect(importSequence([file, file])).toEqual([2, 0]);
  });

  it("um pendente que passa a concluído entra uma única vez", () => {
    const pendingSkipped = rows.slice(0, 10); // pendente não veio na 1.ª importação
    const later = [...rows.slice(0, 10), { ...rows[10], bookedAt: "2026-11-02 10:00:00" }];
    expect(importSequence([pendingSkipped, later, later])).toEqual([10, 1, 0]);
  });
});
