// Dados fictícios para experimentar a app. Tudo o que é criado aqui fica marcado e pode ser apagado
// de uma vez com clearDemo(), sem tocar em dados reais:
//  - movimentos → num lote de importação com file_name = DEMO_FILE
//  - orçamentos → updated_at = "demo"
//  - investimentos e objetivos → created_at = DEMO_CREATED
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";

const { accounts, budgets, categories, goals, importBatches, investments, transactions, users } = schema;

export const DEMO_FILE = "dados-ficticios";
const DEMO_CREATED = "2000-01-01 00:00:00";

export async function hasDemo() {
  const row = await db.select({ id: importBatches.id }).from(importBatches).where(eq(importBatches.fileName, DEMO_FILE)).limit(1).get();
  return !!row;
}

export async function clearDemo() {
  const batches = (await db.select({ id: importBatches.id }).from(importBatches).where(eq(importBatches.fileName, DEMO_FILE)).all()).map((b) => b.id);
  if (batches.length) {
    await db.delete(transactions).where(inArray(transactions.batchId, batches)).run();
    await db.delete(importBatches).where(inArray(importBatches.id, batches)).run();
  }
  await db.delete(budgets).where(eq(budgets.updatedAt, "demo")).run();
  await db.delete(investments).where(eq(investments.createdAt, DEMO_CREATED)).run();
  await db.delete(goals).where(eq(goals.createdAt, DEMO_CREATED)).run();
}

/* ---------- gerador ---------- */

type Scope = "pessoal" | "casal" | "interna" | "entre_nos";
type Kind = "fixa" | "variavel" | "pontual";
type Tx = {
  acc: string;
  owner: string;
  date: string;
  name: string;
  cents: number;
  cat: string | null;
  scope?: Scope;
  kind?: Kind;
  shared?: number;
  notes?: string;
  custom?: string;
  manual?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Texto como o banco o escreve no extrato. */
function bankText(bank: string, name: string, i: number) {
  if (bank === "caixa") return `COMPRA ${4000 + (i % 900)} ${name.toUpperCase()} LISBOA`;
  if (bank === "ing") return `${name} Lisboa PRT ${pad(i % 60)}`;
  return name;
}

export async function loadDemo(now = new Date()) {
  if (await hasDemo()) return 0;

  let seed = 20261121;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

  const people = await db.select().from(users).all();
  const bea = people.find((u) => u.username === "bea") ?? people[0];
  const ivo = people.find((u) => u.username === "ivo") ?? people[1] ?? people[0];
  const cat = Object.fromEntries((await db.select().from(categories).all()).map((c) => [c.name, c.id]));

  async function account(owner: string, bank: "ing" | "revolut" | "caixa" | "dinheiro", name: string) {
    const found = await db.select().from(accounts).where(and(eq(accounts.ownerId, owner), eq(accounts.bank, bank))).get();
    if (found) return found;
    const [row] = await db.insert(accounts).values({ ownerId: owner, bank, name }).returning();
    return row;
  }
  const A = {
    beaCaixa: await account(bea.id, "caixa", "Caixa"),
    beaRev: await account(bea.id, "revolut", "Revolut"),
    beaCash: await account(bea.id, "dinheiro", "Dinheiro"),
    ivoIng: await account(ivo.id, "ing", "ING"),
    ivoRev: await account(ivo.id, "revolut", "Revolut"),
    ivoCash: await account(ivo.id, "dinheiro", "Dinheiro"),
  };

  const txs: Tx[] = [];
  const add = (t: Tx) => txs.push(t);
  const start = new Date(now.getFullYear(), now.getMonth() - 7, 1);
  const today = ymd(now);

  for (let d = new Date(start); ymd(d) <= today; d.setDate(d.getDate() + 1)) {
    const day = d.getDate();
    const date = ymd(d);
    const month = d.getMonth();
    const monthIdx = (d.getFullYear() - start.getFullYear()) * 12 + month - start.getMonth();
    const wd = d.getDay();
    const at = (h: number) => `${date} ${pad(h)}:${pad(between(0, 59))}:${pad(between(0, 59))}`;

    // Salários e transferências do início do mês
    if (day === 1) {
      add({ acc: A.beaCaixa.id, owner: bea.id, date: at(9), name: "Empresa Lda - Salário", cents: 215000 + (monthIdx === 6 ? 107500 : 0), cat: "Salário", kind: "fixa" });
      add({ acc: A.ivoIng.id, owner: ivo.id, date: at(10), name: "Transferência Senhorio - Renda", cents: -95000, cat: "Renda", scope: "casal", kind: "fixa" });
      add({ acc: A.beaCaixa.id, owner: bea.id, date: at(11), name: "Transferência para Revolut", cents: -50000, cat: "Transferências", scope: "interna", kind: "fixa" });
      add({ acc: A.beaRev.id, owner: bea.id, date: at(11), name: "Carregamento de Caixa", cents: 50000, cat: "Transferências", scope: "interna", kind: "fixa" });
    }
    if (day === 26) {
      add({ acc: A.ivoIng.id, owner: ivo.id, date: at(12), name: "Transferência para Revolut", cents: -60000, cat: "Transferências", scope: "interna", kind: "fixa" });
      add({ acc: A.ivoRev.id, owner: ivo.id, date: at(12), name: "Carregamento de ING", cents: 60000, cat: "Transferências", scope: "interna", kind: "fixa" });
    }
    if (day === 25) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(9), name: "Tech Solutions SA - Ordenado", cents: 189000 + (monthIdx === 6 ? 94500 : 0), cat: "Salário", kind: "fixa" });
    if (day === 2) {
      add({ acc: A.beaRev.id, owner: bea.id, date: at(8), name: "Navegante Metropolitano", cents: -4000, cat: "Transportes", kind: "fixa" });
      add({ acc: A.ivoRev.id, owner: ivo.id, date: at(8), name: "Navegante Metropolitano", cents: -4000, cat: "Transportes", kind: "fixa" });
    }
    if (day === 3) add({ acc: A.beaCaixa.id, owner: bea.id, date: at(7), name: "Fitness Hut", cents: -3490, cat: "Lazer e saídas", kind: "fixa" });
    if (day === 4) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(7), name: "Solinca Health Clubs", cents: -2990, cat: "Lazer e saídas", kind: "fixa" });
    if (day === 5) add({ acc: A.ivoRev.id, owner: ivo.id, date: at(3), name: "Netflix.com", cents: -1399, cat: "Subscrições", scope: "casal", kind: "fixa" });
    if (day === 7) add({ acc: A.beaRev.id, owner: bea.id, date: at(4), name: "Spotify Duo", cents: -1399, cat: "Subscrições", scope: "casal", kind: "fixa" });
    if (day === 9 && monthIdx >= 3) add({ acc: A.beaRev.id, owner: bea.id, date: at(4), name: "Disney Plus", cents: -899, cat: "Subscrições", kind: "fixa" });
    if (day === 8) add({ acc: A.beaCaixa.id, owner: bea.id, date: at(10), name: "EDP Comercial", cents: -between(5200, 8900), cat: "Contas da casa", scope: "casal", kind: "fixa" });
    if (day === 10) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(10), name: "MEO Fibra", cents: -4499, cat: "Internet e telemóvel", scope: "casal", kind: "fixa" });
    if (day === 12) add({ acc: A.beaCaixa.id, owner: bea.id, date: at(10), name: "EPAL Águas de Lisboa", cents: -between(2200, 3500), cat: "Contas da casa", scope: "casal", kind: "fixa" });
    if (day === 15) add({ acc: A.beaRev.id, owner: bea.id, date: at(10), name: "Vodafone Portugal", cents: -1500, cat: "Internet e telemóvel", kind: "fixa" });
    if (day === 20) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(10), name: "Fidelidade Seguro Casa", cents: -1840, cat: "Seguros", scope: "casal", kind: "fixa" });
    if (day === 28) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(23), name: "Comissão manutenção conta", cents: -416, cat: "Comissões bancárias", kind: "fixa" });
    if (day === 14) add({ acc: A.beaCaixa.id, owner: bea.id, date: at(12), name: "Cabeleireiro Rosa", cents: -between(2500, 4500), cat: "Saúde e beleza" });

    // Supermercado: ~2× por semana cada um
    if ((wd === 6 || wd === 3) && rnd() < 0.85) {
      const who = rnd() < 0.55 ? { acc: A.beaCaixa.id, owner: bea.id } : { acc: A.ivoIng.id, owner: ivo.id };
      const cents = -between(2500, 11500);
      const split = rnd() < 0.18;
      add({
        ...who,
        date: at(between(10, 20)),
        name: pick(["Pingo Doce", "Continente", "Lidl", "Mercadona"]),
        cents,
        cat: "Supermercado",
        scope: "casal",
        shared: split ? Math.round((-cents * between(55, 75)) / 100) : undefined,
        notes: split ? "Parte da compra eram coisas só minhas (cosmética)." : undefined,
      });
    }
    // Cafés
    for (const p of [
      { acc: A.beaRev.id, owner: bea.id },
      { acc: A.ivoRev.id, owner: ivo.id },
    ])
      if (wd >= 1 && wd <= 5 && rnd() < 0.45)
        add({ ...p, date: at(between(8, 11)), name: pick(["Padaria Portuguesa", "Delta Café", "Starbucks", "Fábrica Coffee Roasters"]), cents: -between(120, 650), cat: "Cafés e snacks" });
    // Restaurantes
    if ((wd === 5 || wd === 6) && rnd() < 0.6) {
      const together = rnd() < 0.5;
      const who = rnd() < 0.5 ? { acc: A.beaRev.id, owner: bea.id } : { acc: A.ivoRev.id, owner: ivo.id };
      add({ ...who, date: at(between(20, 22)), name: pick(["Restaurante O Tasco", "Sushi Yoko", "Pizzaria Lisboa", "Taberna da Rua", "Ramen Shifu"]), cents: -between(1800, together ? 7500 : 3500), cat: "Restaurantes", scope: together ? "casal" : "pessoal" });
    }
    // Transportes
    if (rnd() < 0.12) add({ acc: pick([A.beaRev.id, A.ivoRev.id]), owner: rnd() < 0.5 ? bea.id : ivo.id, date: at(between(18, 23)), name: pick(["Uber", "Bolt"]), cents: -between(550, 1800), cat: "Transportes" });
    if ((day === 6 || day === 21) && rnd() < 0.9) add({ acc: A.ivoIng.id, owner: ivo.id, date: at(18), name: pick(["Galp", "BP", "Repsol"]), cents: -between(4500, 7000), cat: "Transportes" });
    // Compras e lazer
    if (rnd() < 0.05) add({ acc: A.beaRev.id, owner: bea.id, date: at(17), name: pick(["Zara", "Primark", "H&M", "Mango"]), cents: -between(1990, 8990), cat: "Roupa e compras" });
    if (rnd() < 0.04) add({ acc: A.ivoRev.id, owner: ivo.id, date: at(21), name: pick(["Amazon.es", "Worten", "Fnac"]), cents: -between(1500, 14900), cat: "Compras online", kind: rnd() < 0.5 ? "pontual" : "variavel" });
    if (rnd() < 0.04) add({ acc: A.beaRev.id, owner: bea.id, date: at(21), name: pick(["Cinema NOS", "Ticketline", "Museu Gulbenkian"]), cents: -between(900, 4500), cat: "Lazer e saídas", scope: rnd() < 0.5 ? "casal" : "pessoal" });
    if (day === 18 && rnd() < 0.7) add({ acc: A.beaCaixa.id, owner: bea.id, date: at(16), name: "Farmácia Central", cents: -between(480, 2900), cat: "Saúde e beleza" });
    // Dinheiro (manual)
    if (wd === 6 && rnd() < 0.7) add({ acc: A.beaCash.id, owner: bea.id, date: `${date} 12:00:00`, name: "Mercado de Campo de Ourique", cents: -between(600, 2200), cat: "Supermercado", scope: "casal", manual: true });
    if (wd === 0 && rnd() < 0.3) add({ acc: A.ivoCash.id, owner: ivo.id, date: `${date} 12:00:00`, name: "Feira da Ladra", cents: -between(500, 3000), cat: "Outros", manual: true });
    // Entre nós
    if (day === 16 && rnd() < 0.7) {
      const c = between(5000, 15000);
      const t = at(19);
      add({ acc: A.beaRev.id, owner: bea.id, date: t, name: `MB WAY para ${ivo.displayName}`, cents: -c, cat: "Transferências", scope: "entre_nos", kind: "pontual" });
      add({ acc: A.ivoRev.id, owner: ivo.id, date: t, name: `MB WAY de ${bea.displayName}`, cents: c, cat: "Transferências", scope: "entre_nos", kind: "pontual" });
    }
  }

  // Pontuais com nome mudado e notas
  const m = (k: number, day: number) => ymd(new Date(start.getFullYear(), start.getMonth() + k, day));
  add({ acc: A.beaRev.id, owner: bea.id, date: `${m(3, 9)} 14:02:11`, name: "Ryanair", cents: -18760, cat: "Viagens", scope: "casal", kind: "pontual", notes: "Voos para Nápoles, ida e volta para os dois." });
  add({ acc: A.ivoRev.id, owner: ivo.id, date: `${m(3, 10)} 22:40:03`, name: "Booking.com", cents: -42300, cat: "Viagens", scope: "casal", kind: "pontual", custom: "Hotel em Nápoles (4 noites)" });
  add({ acc: A.ivoIng.id, owner: ivo.id, date: `${m(2, 14)} 11:00:00`, name: "AT - IUC", cents: -12800, cat: "Impostos", kind: "pontual" });
  add({ acc: A.ivoIng.id, owner: ivo.id, date: `${m(4, 22)} 09:00:00`, name: "AT - Reembolso IRS", cents: 41020, cat: "Outras receitas", kind: "pontual" });
  add({ acc: A.beaRev.id, owner: bea.id, date: `${m(5, 3)} 15:30:00`, name: "Vinted", cents: 2500, cat: "Outras receitas", kind: "pontual" });
  add({ acc: A.beaRev.id, owner: bea.id, date: `${m(6, 12)} 20:15:40`, name: "MBWAY 912345678", cents: -3200, cat: "Restaurantes", custom: "Jantar de anos da Joana", notes: "A Joana pagou o restaurante e eu transferi a minha parte." });
  add({ acc: A.ivoRev.id, owner: ivo.id, date: `${m(5, 20)} 18:00:00`, name: "IKEA Alfragide", cents: -28950, cat: "Casa", scope: "casal", kind: "pontual", shared: 20000, notes: "O candeeiro (89,50 €) era para o meu escritório." });
  add({ acc: A.beaCaixa.id, owner: bea.id, date: `${m(7, 1)} 16:00:00`, name: "Prenda aniversário mãe", cents: -6000, cat: "Presentes", kind: "pontual" });

  // Os mais recentes ficam por rever (alguns sem categoria)
  txs.sort((a, b) => a.date.localeCompare(b.date));
  const recent = txs.filter((t) => !t.manual).slice(-7);

  // Saldos correntes por conta (o extrato traz o saldo depois de cada movimento)
  const opening: Record<string, number> = { [A.beaCaixa.id]: 320000, [A.beaRev.id]: 45000, [A.ivoIng.id]: 510000, [A.ivoRev.id]: 30000 };
  const bal = { ...opening };
  const bankOf: Record<string, string> = Object.fromEntries(Object.values(A).map((a) => [a.id, a.bank]));

  const batchByAcc: Record<string, string> = {};
  for (const a of Object.values(A)) {
    const [b] = await db
      .insert(importBatches)
      .values({ accountId: a.id, userId: a.ownerId, fileName: DEMO_FILE, parser: "demo", rowCount: 0, importedCount: 0, duplicateCount: 0 })
      .returning({ id: importBatches.id });
    batchByAcc[a.id] = b.id;
  }

  const rows = txs.map((t, i) => {
    const isRecent = recent.includes(t);
    const manual = !!t.manual;
    if (!manual) bal[t.acc] = (bal[t.acc] ?? 0) + t.cents;
    return {
      ownerId: t.owner,
      accountId: t.acc,
      batchId: batchByAcc[t.acc],
      date: t.date,
      descriptionOriginal: manual ? t.name : bankText(bankOf[t.acc], t.name, i),
      description: t.name,
      customDescription: t.custom ?? null,
      bankType: manual ? "manual" : null,
      amountCents: t.cents,
      balanceCents: manual ? null : bal[t.acc],
      categoryId: isRecent && i % 3 === 0 ? null : t.cat ? (cat[t.cat] ?? null) : null,
      scope: t.scope ?? "pessoal",
      kind: t.kind ?? "variavel",
      sharedCents: t.scope === "casal" && t.shared ? t.shared : null,
      notes: t.notes ?? null,
      hash: `demo-${i}`,
      needsReview: isRecent,
    };
  });
  for (let i = 0; i < rows.length; i += 100) await db.insert(transactions).values(rows.slice(i, i + 100)).run();

  // Orçamentos (só para quem ainda não tem nenhum)
  for (const u of [bea, ivo]) {
    const has = await db.select({ c: budgets.categoryId }).from(budgets).where(eq(budgets.userId, u.id)).limit(1).get();
    if (has) continue;
    const plan: [string, number][] = [
      ["Supermercado", 38000],
      ["Restaurantes", 15000],
      ["Cafés e snacks", 6000],
      ["Transportes", u === ivo ? 20000 : 9000],
      ["Roupa e compras", 8000],
      ["Lazer e saídas", 9000],
      ["Subscrições", 4000],
    ];
    await db.insert(budgets).values(plan.filter(([n]) => cat[n]).map(([n, c]) => ({ userId: u.id, categoryId: cat[n], amountCents: c, updatedAt: "demo" }))).run();
  }

  const upd = new Date().toISOString();
  await db
    .insert(investments)
    .values([
      { userId: bea.id, name: "ETF Vanguard FTSE All-World (VWCE)", type: "etf" as const, investedCents: 320000, valueCents: 371040, updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: bea.id, name: "PPR Optimize", type: "ppr" as const, investedCents: 150000, valueCents: 158820, updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: bea.id, name: "Bitcoin", type: "cripto" as const, investedCents: 40000, valueCents: 35200, updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: ivo.id, name: "Ações Apple (AAPL)", type: "acoes" as const, investedCents: 120000, valueCents: 138500, updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: ivo.id, name: "Depósito a prazo 12 meses", type: "deposito" as const, investedCents: 500000, valueCents: 507500, updatedAt: upd, createdAt: DEMO_CREATED },
    ])
    .run();
  const ym = (k: number) => { const x = new Date(now.getFullYear(), now.getMonth() + k, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };
  await db
    .insert(goals)
    .values([
      { userId: bea.id, name: "Férias no Japão", targetCents: 400000, savedCents: 135000, targetMonth: ym(10), updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: bea.id, name: "Fundo de emergência", targetCents: 900000, savedCents: 620000, targetMonth: null, updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: bea.id, name: "Portátil novo", targetCents: 120000, savedCents: 120000, targetMonth: ym(-1), updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: ivo.id, name: "Carro novo", targetCents: 800000, savedCents: 210000, targetMonth: ym(19), updatedAt: upd, createdAt: DEMO_CREATED },
      { userId: ivo.id, name: "Prendas de Natal", targetCents: 40000, savedCents: 15000, targetMonth: ym(1), updatedAt: upd, createdAt: DEMO_CREATED },
    ])
    .run();

  return rows.length;
}
