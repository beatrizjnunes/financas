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
export function coupleBalance(txs: CoupleTx[], a: Person, b: Person, shareA = 0.5): CoupleBalance {
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
  const netA = paidA - shareCentsA;
  const netB = paidB - shareCentsB; // = −netA

  const people: [PersonBalance, PersonBalance] = [
    { ...a, paidCents: paidA, shareCents: shareCentsA, netCents: netA },
    { ...b, paidCents: paidB, shareCents: shareCentsB, netCents: netB },
  ];
  const debt = netA === 0 ? null : netA > 0 ? { from: b, to: a, cents: netA } : { from: a, to: b, cents: -netA };
  return { totalCents: total, people, debt };
}
