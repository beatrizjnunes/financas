import { describe, expect, it } from "vitest";
import { cumulativeByDay, insights, monthlyFlow, prevMonth, spendByCategory, spendByKind, topMerchants, type ATx } from "@/lib/analytics";

const tx = (date: string, amountCents: number, categoryName: string | null = "Supermercado", description = "AH"): ATx => ({
  date: `${date} 12:00:00`,
  amountCents,
  description,
  categoryId: categoryName,
  categoryName,
  kind: categoryName === "Renda" ? "fixa" : "variavel",
});

const data = [
  tx("2026-08-20", -1000),
  tx("2026-10-01", 300000, "Salário", "Empresa"),
  tx("2026-10-02", -143000, "Renda", "Senhorio"),
  tx("2026-10-05", -5000),
  tx("2026-10-20", -2000),
  tx("2026-10-21", -3000, null, "???"),
  tx("2026-09-10", -2000),
];

it("prevMonth vira o ano", () => {
  expect(prevMonth("2026-01")).toBe("2025-12");
});

describe("monthlyFlow", () => {
  const f = monthlyFlow(data);
  it("preenche meses vazios", () => {
    expect(f.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
  it("calcula entradas, saídas e taxa de poupança", () => {
    const oct = f.at(-1)!;
    expect(oct.incomeCents).toBe(300000);
    expect(oct.spentCents).toBe(153000);
    expect(oct.netCents).toBe(147000);
    expect(oct.savingsRate).toBeCloseTo(0.49);
    expect(f[0].savingsRate).toBeNull();
  });
});

it("spendByCategory compara com o mês anterior", () => {
  const c = spendByCategory(data, "2026-10");
  expect(c[0]).toMatchObject({ name: "Renda", cents: 143000, prevCents: 0 });
  expect(c.find((x) => x.name === "Supermercado")).toMatchObject({ cents: 7000, prevCents: 2000 });
  expect(c.find((x) => x.key === "sem")?.cents).toBe(3000);
});

it("spendByKind", () => {
  expect(spendByKind(data, "2026-10")).toEqual({ fixa: 143000, variavel: 10000, pontual: 0 });
});

it("topMerchants agrupa por descrição", () => {
  expect(topMerchants(data, "2026-10")[1]).toEqual({ name: "AH", cents: 7000, count: 2 });
});

it("cumulativeByDay acumula até ao fim do mês", () => {
  const c = cumulativeByDay(data, "2026-10");
  expect(c).toHaveLength(31);
  expect(c[0]).toBe(0);
  expect(c[1]).toBe(143000);
  expect(c[30]).toBe(153000);
});

it("insights destacam variações relevantes", () => {
  const i = insights(data, "2026-10", (c) => `${c / 100}€`).map((x) => x.text);
  expect(i.some((t) => t.startsWith("Supermercado: +250%"))).toBe(true);
  expect(i.some((t) => t.startsWith("Renda:"))).toBe(true);
});
