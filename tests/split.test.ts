import { describe, expect, it } from "vitest";
import { coupleBalance, myShareOf, normalizeShared, settlementsFrom, sharedAmount } from "@/lib/split";

const ivo = { id: "ivo", name: "Ivo" };
const bea = { id: "bea", name: "Bea" };

describe("acertos de contas (Entre nós)", () => {
  it("a renda paga pela Bea e a metade transferida pelo Ivo deixam-nos quites", () => {
    const rent = [{ paidBy: "bea", amountCents: -95000 }];
    expect(coupleBalance(rent, ivo, bea).debt).toEqual({ from: ivo, to: bea, cents: 47500 });
    const s = settlementsFrom([{ ownerId: "bea", amountCents: 47500, date: "2026-11-02 10:00:00" }], "ivo", "bea");
    expect(s).toEqual([{ from: "ivo", to: "bea", cents: 47500, date: "2026-11-02 10:00:00" }]);
    expect(coupleBalance(rent, ivo, bea, 0.5, s).debt).toBeNull();
  });
  it("a mesma transferência vista dos dois lados conta uma vez", () => {
    const s = settlementsFrom(
      [
        { ownerId: "ivo", amountCents: -47500, date: "2026-11-01 22:00:00" },
        { ownerId: "bea", amountCents: 47500, date: "2026-11-02 09:00:00" },
        { ownerId: "bea", amountCents: 2000, date: "2026-11-10 09:00:00" },
      ],
      "ivo",
      "bea",
    );
    expect(s.map((x) => [x.from, x.cents])).toEqual([
      ["ivo", 2000],
      ["ivo", 47500],
    ]);
  });
  it("transferir a mais passa a dívida para o outro lado", () => {
    const s = [{ from: "ivo", to: "bea", cents: 60000, date: "2026-11-02" }];
    expect(coupleBalance([{ paidBy: "bea", amountCents: -95000 }], ivo, bea, 0.5, s).debt).toEqual({ from: bea, to: ivo, cents: 12500 });
  });
});

describe("a minha parte (análise pessoal)", () => {
  const rows = [
    { ownerId: "bea", scope: "pessoal", amountCents: -1000, sharedCents: null },
    { ownerId: "bea", scope: "casal", amountCents: -95000, sharedCents: null },
    { ownerId: "ivo", scope: "casal", amountCents: -8000, sharedCents: null },
    { ownerId: "bea", scope: "casal", amountCents: -10000, sharedCents: 6000 },
    { ownerId: "ivo", scope: "pessoal", amountCents: -500, sharedCents: null },
  ];
  it("pessoal inteiro, metade do partilhado de quem quer que tenha pago, o resto não partilhado inteiro", () => {
    expect(myShareOf(rows, "bea").map((r) => r.amountCents)).toEqual([-1000, -47500, -4000, -4000, -3000]);
    expect(myShareOf(rows, "ivo").map((r) => r.amountCents)).toEqual([-47500, -4000, -3000, -500]);
  });
});

describe("parte partilhada", () => {
  it("sharedAmount mantém o sinal e não passa do total", () => {
    expect(sharedAmount(-6538, null)).toBe(-6538);
    expect(sharedAmount(-6538, 3000)).toBe(-3000);
    expect(sharedAmount(2000, 500)).toBe(500);
    expect(sharedAmount(-1000, 5000)).toBe(-1000);
  });
  it("normalizeShared volta a «tudo» quando não faz sentido dividir", () => {
    expect(normalizeShared(-6538, 3000)).toBe(3000);
    expect(normalizeShared(-6538, 6538)).toBeNull();
    expect(normalizeShared(-6538, 9000)).toBeNull();
    expect(normalizeShared(-6538, 0)).toBeNull();
    expect(normalizeShared(-6538, null)).toBeNull();
  });
  it("o saldo usa só a parte partilhada", () => {
    // Bea pagou 100 € de supermercado, mas só 60 € eram da casa → Ivo deve 30 €.
    const r = coupleBalance([{ paidBy: "bea", amountCents: sharedAmount(-10000, 6000) }], ivo, bea);
    expect(r.debt).toEqual({ from: ivo, to: bea, cents: 3000 });
  });
});

describe("saldo do casal", () => {
  it("50/50: quem pagou mais tem a receber metade da diferença", () => {
    const r = coupleBalance(
      [
        { paidBy: "bea", amountCents: -143000 }, // renda
        { paidBy: "ivo", amountCents: -8000 },
        { paidBy: "ivo", amountCents: -4320 },
      ],
      ivo,
      bea,
    );
    expect(r.totalCents).toBe(155320);
    expect(r.people[0].paidCents).toBe(12320);
    expect(r.people[1].paidCents).toBe(143000);
    expect(r.debt).toEqual({ from: ivo, to: bea, cents: 65340 });
  });

  it("as partes somam sempre o total, mesmo com cêntimos ímpares", () => {
    const r = coupleBalance([{ paidBy: "ivo", amountCents: -1001 }], ivo, bea);
    expect(r.people[0].shareCents + r.people[1].shareCents).toBe(1001);
    expect(r.people[0].netCents + r.people[1].netCents).toBe(0);
    expect(r.debt?.cents).toBe(500);
  });

  it("divisão 60/40", () => {
    const r = coupleBalance([{ paidBy: "bea", amountCents: -10000 }], ivo, bea, 0.6);
    expect(r.people[0].shareCents).toBe(6000);
    expect(r.debt).toEqual({ from: ivo, to: bea, cents: 6000 });
  });

  it("reembolsos reduzem o que a pessoa pagou", () => {
    const r = coupleBalance(
      [
        { paidBy: "ivo", amountCents: -10000 },
        { paidBy: "ivo", amountCents: 2000 }, // devolução
      ],
      ivo,
      bea,
    );
    expect(r.totalCents).toBe(8000);
    expect(r.debt).toEqual({ from: bea, to: ivo, cents: 4000 });
  });

  it("quites quando pagaram o mesmo", () => {
    const r = coupleBalance(
      [
        { paidBy: "ivo", amountCents: -5000 },
        { paidBy: "bea", amountCents: -5000 },
      ],
      ivo,
      bea,
    );
    expect(r.debt).toBeNull();
  });

  it("sem despesas não há dívida", () => {
    expect(coupleBalance([], ivo, bea).debt).toBeNull();
  });

  it("recusa pagadores desconhecidos e divisões inválidas", () => {
    expect(() => coupleBalance([{ paidBy: "x", amountCents: -1 }], ivo, bea)).toThrow();
    expect(() => coupleBalance([], ivo, bea, 1.2)).toThrow();
  });
});
