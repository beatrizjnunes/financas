import { describe, expect, it } from "vitest";
import {
  averageByCategory,
  averageMonthlySpend,
  budgetLines,
  cumulativeByDay,
  goalPlan,
  insights,
  monthsBetween,
  merchantKey,
  monthlyFlow,
  monthsBefore,
  prevMonth,
  projectMonth,
  recurringExpenses,
  roundUpToFive,
  spendByCategory,
  spendByKind,
  topMerchants,
  type ATx,
} from "@/lib/analytics";

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

describe("averageByCategory", () => {
  it("faz a média dos meses anteriores com dados, sem contar o próprio mês", () => {
    const avg = averageByCategory(data, "2026-10");
    // ago 10 €, set 20 € → 2 meses com dados (julho fica de fora por ser antes do 1.º extrato)
    expect(avg.get("Supermercado")?.avgCents).toBe(1500);
    expect(avg.has("Renda")).toBe(false);
  });
  it("monthsBefore não recua antes do primeiro mês", () => {
    expect(monthsBefore("2026-10", 3, "2026-08")).toEqual(["2026-08", "2026-09"]);
    expect(monthsBefore("2026-01", 2)).toEqual(["2025-11", "2025-12"]);
  });
});

describe("budgetLines", () => {
  const cats = [
    { id: "Supermercado", name: "Supermercado" },
    { id: "Renda", name: "Renda" },
    { id: "Lazer", name: "Lazer" },
  ];
  it("classifica ok / atenção / excedido / sem orçamento", () => {
    const b = new Map([
      ["Supermercado", 6000],
      ["Renda", 150000],
      ["Lazer", 1000],
    ]);
    const lines = budgetLines(data, "2026-10", cats, b, null);
    expect(lines.find((l) => l.key === "Supermercado")?.status).toBe("excedido");
    expect(lines.find((l) => l.key === "Renda")?.status).toBe("ok"); // 95%, mês fechado
    expect(lines.find((l) => l.key === "Lazer")?.status).toBe("ok");
    expect(budgetLines(data, "2026-10", cats, new Map(), null)[0].status).toBe("sem");
  });
  it("usa a previsão no mês corrente", () => {
    const lines = budgetLines(data, "2026-10", cats, new Map([["Supermercado", 10000]]), { day: 10, days: 31 });
    const s = lines.find((l) => l.key === "Supermercado")!;
    expect(s.projectedCents).toBe(21700);
    expect(s.status).toBe("atencao");
  });
  it("não extrapola despesas fixas (a renda paga no dia 2 não «cresce»)", () => {
    const lines = budgetLines(data, "2026-10", cats, new Map([["Renda", 143000]]), { day: 10, days: 31 });
    const r = lines.find((l) => l.key === "Renda")!;
    expect(r.projectedCents).toBe(143000);
    expect(r.status).toBe("ok");
  });
  it("projectMonth: fixas ficam, variáveis seguem o ritmo", () => {
    // fixa 1430 € + variáveis 100 € em 10 dias → 1430 + 310
    expect(projectMonth(data, "2026-10", { day: 10, days: 31 })).toBe(174000);
    expect(projectMonth(data, "2026-10", null)).toBeNull();
  });
  it("roundUpToFive", () => {
    expect(roundUpToFive(1201)).toBe(1500);
    expect(roundUpToFive(1500)).toBe(1500);
  });
});

describe("recurringExpenses", () => {
  const sub = (m: string, c: number, d = "NETFLIX.COM 1234") => tx(`2026-${m}-03`, c, "Subscrições", d);
  const rec = [
    sub("06", -1199),
    sub("07", -1199, "NETFLIX.COM 5678"),
    sub("08", -1299),
    sub("09", -1299),
    // supermercado: muitas vezes por mês → não é recorrente
    ...["06", "07", "08", "09"].flatMap((m) => [tx(`2026-${m}-01`, -3000), tx(`2026-${m}-10`, -4500), tx(`2026-${m}-20`, -2000)]),
    // ginásio que acabou em julho → já não está ativo
    ...["04", "05", "06", "07"].map((m) => tx(`2026-${m}-05`, -3500, "Lazer", "GINASIO")),
    // valores muito diferentes → não é estável
    ...["06", "07", "08", "09"].map((m, i) => tx(`2026-${m}-15`, -[1000, 9000, 2500, 15000][i], "Compras online", "AMAZON")),
  ];
  const r = recurringExpenses(rec, "2026-09");
  it("deteta subscrições estáveis e ativas", () => {
    expect(r.map((x) => x.key)).toEqual(["netflix com"]);
    expect(r[0]).toMatchObject({ monthlyCents: 1249, annualCents: 14988, months: 4, categoryName: "Subscrições" });
  });
  it("ignora supermercados mesmo que pareçam regulares", () => {
    const lidl = ["06", "07", "08", "09"].map((m) => tx(`2026-${m}-04`, -5400, "Supermercado", "Lidl"));
    expect(recurringExpenses(lidl, "2026-09")).toEqual([]);
  });
  it("merchantKey ignora números e acentos", () => {
    expect(merchantKey("Pingo Doce Lisboa 0231")).toBe(merchantKey("PINGO DOCE LISBOA 9999"));
    expect(merchantKey("Água")).toBe("agua");
  });
});

describe("goalPlan", () => {
  it("calcula quanto falta por mês até à data", () => {
    const p = goalPlan({ targetCents: 150000, savedCents: 45000, targetMonth: "2027-06" }, "2026-11");
    expect(p).toMatchObject({ remainingCents: 105000, monthsLeft: 7, perMonthCents: 15000, done: false, late: false });
    expect(p.ratio).toBeCloseTo(0.3);
  });
  it("objetivo atingido, sem data e atrasado", () => {
    expect(goalPlan({ targetCents: 1000, savedCents: 1200, targetMonth: null }, "2026-11")).toMatchObject({ done: true, ratio: 1, perMonthCents: null });
    expect(goalPlan({ targetCents: 1000, savedCents: 0, targetMonth: null }, "2026-11").perMonthCents).toBeNull();
    expect(goalPlan({ targetCents: 1000, savedCents: 0, targetMonth: "2026-10" }, "2026-11")).toMatchObject({ late: true, perMonthCents: 1000 });
  });
  it("monthsBetween", () => {
    expect(monthsBetween("2026-11", "2027-06")).toBe(7);
    expect(monthsBetween("2026-11", "2026-11")).toBe(0);
  });
});

it("averageMonthlySpend usa os meses completos anteriores", () => {
  const f = monthlyFlow(data);
  expect(averageMonthlySpend(f, "2026-10")).toBe(1500);
  expect(averageMonthlySpend(f, "2026-08")).toBeNull();
});

it("insights destacam variações relevantes", () => {
  const i = insights(data, "2026-10", (c) => `${c / 100}€`).map((x) => x.text);
  expect(i.some((t) => t.startsWith("Supermercado: +250%"))).toBe(true);
  expect(i.some((t) => t.startsWith("Renda:"))).toBe(true);
});
