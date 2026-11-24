// Contas do casal. Tudo em cêntimos inteiros: nunca se perde nem se cria um cêntimo.

export type CoupleTx = { paidBy: string; amountCents: number };

/**
 * Valor que conta como partilhado (com o sinal do movimento). `sharedCents` null = tudo.
 * Nunca passa do valor do movimento.
 */
export function sharedAmount(amountCents: number, sharedCents: number | null): number {
  if (sharedCents == null) return amountCents;
  const part = Math.min(Math.abs(sharedCents), Math.abs(amountCents));
  return amountCents < 0 ? -part : part;
}

/**
 * Normaliza a parte partilhada que o utilizador escreveu: null (= tudo) se for vazia, ≤ 0 ou ≥ o valor
 * do movimento; senão os cêntimos, positivos.
 */
export function normalizeShared(amountCents: number, cents: number | null): number | null {
  if (cents == null || cents <= 0 || cents >= Math.abs(amountCents)) return null;
  return Math.round(cents);
}
export type Person = { id: string; name: string };

export type PersonBalance = {
  id: string;
  name: string;
  /** Quanto esta pessoa pagou do bolso em despesas comuns (reembolsos recebidos descontam). */
  paidCents: number;
  /** Quanto lhe cabia pagar segundo a divisão. */
  shareCents: number;
  /** paid − share: positivo = tem a receber, negativo = deve. */
  netCents: number;
};

export type CoupleBalance = {
  totalCents: number;
  people: [PersonBalance, PersonBalance];
  /** null quando estão quites. */
  debt: { from: Person; to: Person; cents: number } | null;
};

/**
 * Calcula quem pagou o quê e quanto um deve ao outro.
 * `shareA` é a fração de A (0.5 = 50/50). A parte de B é sempre total − parte de A,
 * para que as duas somem exatamente o total.
 */
/** Dinheiro que um passou ao outro (transferências "Entre nós"): acerta o saldo partilhado. */
export type Settlement = { from: string; to: string; cents: number; date: string };

export function coupleBalance(txs: CoupleTx[], a: Person, b: Person, shareA = 0.5, settlements: Settlement[] = []): CoupleBalance {
  if (shareA < 0 || shareA > 1) throw new Error("A divisão tem de estar entre 0 e 1");
  let paidA = 0;
  let paidB = 0;
  for (const t of txs) {
    // Despesa (valor negativo) → pagou −valor. Reembolso (positivo) → reduz o que pagou.
    const paid = -t.amountCents;
    if (t.paidBy === a.id) paidA += paid;
    else if (t.paidBy === b.id) paidB += paid;
    else throw new Error(`Pagador desconhecido: ${t.paidBy}`);
  }
  const total = paidA + paidB;
  const shareCentsA = Math.round(total * shareA);
  const shareCentsB = total - shareCentsA;
  // Quem transfere dinheiro para o outro fica com menos a dever (ou mais a receber).
  const sentA = settlements.reduce((s, x) => s + (x.from === a.id ? x.cents : x.to === a.id ? -x.cents : 0), 0);
  const netA = paidA - shareCentsA + sentA;
  const netB = -netA;

  const people: [PersonBalance, PersonBalance] = [
    { ...a, paidCents: paidA, shareCents: shareCentsA, netCents: netA },
    { ...b, paidCents: paidB, shareCents: shareCentsB, netCents: netB },
  ];
  const debt = netA === 0 ? null : netA > 0 ? { from: b, to: a, cents: netA } : { from: a, to: b, cents: -netA };
  return { totalCents: total, people, debt };
}

type TransferRow = { ownerId: string; amountCents: number; date: string };

/**
 * Transforma os movimentos "Entre nós" dos dois em acertos de contas. A mesma transferência costuma
 * aparecer duas vezes (a saída de um e a entrada do outro): conta-se só uma vez, emparelhando
 * valores iguais com até 3 dias de diferença.
 */
export function settlementsFrom(rows: TransferRow[], a: string, b: string): Settlement[] {
  const other = (id: string) => (id === a ? b : a);
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
  const outgoing = rows.filter((r) => r.amountCents < 0 && (r.ownerId === a || r.ownerId === b));
  const used = new Set<TransferRow>();
  const out: Settlement[] = outgoing.map((r) => ({ from: r.ownerId, to: other(r.ownerId), cents: -r.amountCents, date: r.date }));
  for (const r of rows) {
    if (r.amountCents <= 0 || (r.ownerId !== a && r.ownerId !== b)) continue;
    const twin = outgoing.find(
      (o) => !used.has(o) && o.ownerId === other(r.ownerId) && -o.amountCents === r.amountCents && Math.abs(day(o.date) - day(r.date)) <= 3,
    );
    if (twin) used.add(twin);
    else out.push({ from: other(r.ownerId), to: r.ownerId, cents: r.amountCents, date: r.date });
  }
  return out.sort((x, y) => y.date.localeCompare(x.date));
}

type ShareRow = {
  ownerId: string;
  scope: string;
  amountCents: number;
  sharedCents: number | null;
};

/**
 * Para a análise pessoal: o que é teu de cada movimento. Pessoal conta inteiro; num Partilhado contas
 * metade da parte partilhada (pagaste tu ou o outro) e, se só parte era partilhada, o resto inteiro.
 */
export function myShareOf<T extends ShareRow>(rows: T[], me: string): (T & { amountCents: number })[] {
  const out: (T & { amountCents: number })[] = [];
  for (const r of rows) {
    if (r.scope !== "casal") {
      if (r.ownerId === me) out.push(r);
      continue;
    }
    const shared = sharedAmount(r.amountCents, r.sharedCents);
    const half = Math.round(shared / 2);
    if (r.ownerId === me) {
      const personal = r.amountCents - shared;
      if (personal !== 0) out.push({ ...r, amountCents: personal });
    }
    if (half !== 0) out.push({ ...r, amountCents: half });
  }
  return out;
}
