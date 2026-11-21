import { describe, expect, it } from "vitest";
import { coupleBalance } from "@/lib/split";

const ivo = { id: "ivo", name: "Ivo" };
const bea = { id: "bea", name: "Bea" };

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
