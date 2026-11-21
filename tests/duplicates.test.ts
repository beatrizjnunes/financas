import { describe, expect, it } from "vitest";
import { candidateWindow, findPossibleDuplicate, looksLikeSameTransaction } from "@/server/import/duplicates";

const tx = (date: string, amountCents: number, id = date) => ({
  id,
  date,
  amountCents,
  description: "Albert Heijn",
  accountName: "ING",
});

describe("duplicados prováveis", () => {
  it.each([
    ["mesma hora exata", "2026-10-30 18:26:00", "2026-10-30 18:26:00", true],
    ["minutos de diferença (ING arredonda ao minuto)", "2026-10-30 18:26:00", "2026-10-30 18:26:41", true],
    ["15 min ainda conta", "2026-10-30 18:26:00", "2026-10-30 18:41:00", true],
    ["16 min já não", "2026-10-30 18:26:00", "2026-10-30 18:42:00", false],
    ["mesmo dia mas horas diferentes não é duplicado", "2026-10-30 09:00:00", "2026-10-30 18:00:00", false],
    ["sem hora: dia seguinte (data de lançamento)", "2026-10-31 00:00:00", "2026-10-30 18:26:00", true],
    ["sem hora: dois dias depois já não", "2026-11-01 00:00:00", "2026-10-30 18:26:00", false],
    ["atravessa a meia-noite", "2026-10-30 23:55:00", "2026-10-31 00:05:30", true],
  ])("%s", (_, a, b, expected) => {
    expect(looksLikeSameTransaction({ date: a, amountCents: -2198 }, { date: b, amountCents: -2198 })).toBe(expected);
  });

  it("valores diferentes nunca são duplicados", () => {
    expect(
      looksLikeSameTransaction(
        { date: "2026-10-30 18:26:00", amountCents: -2198 },
        { date: "2026-10-30 18:26:00", amountCents: -2199 },
      ),
    ).toBe(false);
  });

  it("uma despesa e uma entrada do mesmo valor não são o mesmo movimento", () => {
    expect(
      looksLikeSameTransaction(
        { date: "2026-10-02 09:21:00", amountCents: 71500 },
        { date: "2026-10-02 09:21:00", amountCents: -71500 },
      ),
    ).toBe(false);
  });

  it("escolhe o movimento mais próximo no tempo", () => {
    const existing = [
      tx("2026-10-30 18:15:00", -2198, "longe"),
      tx("2026-10-30 18:27:00", -2198, "perto"),
      tx("2026-10-30 18:26:00", -500, "outro valor"),
    ];
    expect(findPossibleDuplicate({ date: "2026-10-30 18:26:00", amountCents: -2198 }, existing)?.id).toBe("perto");
  });

  it("sem nada parecido devolve null", () => {
    expect(
      findPossibleDuplicate({ date: "2026-10-30 18:26:00", amountCents: -2198 }, [tx("2026-10-29 18:26:00", -2198)]),
    ).toBeNull();
  });

  it("a janela de pesquisa cobre um dia antes e um depois", () => {
    expect(candidateWindow(["2026-10-30 18:26:00", "2026-09-01 00:00:00", "2026-10-01 12:00:00"])).toEqual({
      from: "2026-08-31",
      to: "2026-10-31 23:59:59",
    });
  });
});
