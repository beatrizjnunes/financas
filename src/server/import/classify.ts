import type { Scope } from "@/lib/labels";
import type { ParsedRow } from "./types";

export type People = { ownNames: string[]; partnerNames: string[] };

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * O nome da contraparte é igual a um dos nomes, ou é o início dele cortado pelo banco
 * (a Caixa mostra "Beatriz Jacinto N" para "Beatriz Jacinto Nunes").
 */
const matchesAny = (who: string, names: string[]) => {
  const w = normalize(who);
  return names.some((n) => {
    const x = normalize(n);
    return !!x && (x === w || (w.length >= 10 && w.includes(" ") && x.startsWith(w)));
  });
};

/** Sugere o âmbito: transferências para nós próprios ou para o parceiro não são despesas. */
export function suggestScope(row: ParsedRow, people: People): Scope {
  if (row.counterparty) {
    if (matchesAny(row.counterparty, people.ownNames)) return "interna";
    if (matchesAny(row.counterparty, people.partnerNames)) return "entre_nos";
  }
  // Carregamento com cartão próprio (ex.: Apple Pay top-up a partir do cartão do ING).
  if (row.bankType === "Topup" && /top-up by \*\d+/i.test(row.descriptionOriginal)) return "interna";
  // …e o mesmo carregamento visto do lado do ING ("Revolut**1552* Dublin IRL").
  if (row.amountCents < 0 && /^Revolut\*/i.test(row.descriptionOriginal)) return "interna";
  // …e do lado da Caixa ("CAR WAL REVOLUT 6408").
  if (row.amountCents < 0 && /^CAR WAL REVOLUT\b/i.test(row.descriptionOriginal)) return "interna";
  // Albert Heijn: em dias úteis das 9h às 18h é o almoço/lanche de cada um; fora disso são compras da casa.
  if (row.amountCents < 0 && /albert heijn|\bah to go\b/i.test(row.descriptionOriginal)) {
    return isWorkingHours(row.date) ? "pessoal" : "casal";
  }
  return "pessoal";
}

/** "2026-09-14 12:54:16" → segunda a sexta, das 9:00 às 17:59. */
export function isWorkingHours(date: string): boolean {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const time = date.slice(11, 16);
  return weekday >= 1 && weekday <= 5 && time >= "09:00" && time < "18:00";
}

// Comerciantes públicos → categoria. Regras pessoais (senhorio, empregador…) ficam na BD (Fase 2).
const KEYWORDS: [RegExp, string][] = [
  [/albert heijn|\bah to go\b|^ah\s+\d|jumbo|lidl|aldi|dirk|\bplus\b|ekoplaza|spar|pingo doce|continente|auchan/i, "Supermercado"],
  [/restaura|spaghetteria|pizzeria|sushi|burger|thuisbezorgd|uber eats|deliveroo|catering|five guys|doenerland|foodhall/i, "Restaurantes"],
  [/koekela|bakker|starbucks|coffee|caf[eé]|parqiet|cinnabon|joe\s+the\s+juice/i, "Cafés e snacks"],
  [/ns reizigers|\bov[- ]?chip|ovpay|\bgvb\b|\bret\b|transport for london|uber(?! eats)|bolt/i, "Transportes"],
  [/klm|transavia|ryanair|easyjet|\btap\b|booking\.com|airbnb/i, "Viagens"],
  [/primark|uniqlo|h&m|zara|vinted|c&a|mango|tk maxx/i, "Roupa e compras"],
  [/kruidvat|etos|sephora|douglas|apotheek|farm[aá]cia/i, "Saúde e beleza"],
  [/ikea|jysk|action|flying tiger|hema|pipoos|blokker|botanico|so ?low|^normal$/i, "Casa"],
  [/netflix|spotify|disney|youtube|icloud|apple\.com|patreon|openai|chatgpt/i, "Subscrições"],
  [/amazon|bol\.com|coolblue|zalando|temu|shein/i, "Compras online"],
  [/ziggo|\bkpn\b|odido|vodafone|lebara/i, "Internet e telemóvel"],
  [/evides|waterbedrijf|vattenfall|eneco|essent|greenchoice/i, "Contas da casa"],
];

export function suggestCategoryName(row: ParsedRow, scope: Scope): string | null {
  if (scope === "interna" || scope === "entre_nos") return "Transferências";
  if (row.feeCents > 0 && row.amountCents === -row.feeCents) return "Comissões bancárias";
  if (row.amountCents > 0) return "Outras receitas";
  const text = `${row.descriptionOriginal} ${row.counterparty ?? ""}`.trim();
  for (const [re, name] of KEYWORDS) if (re.test(text)) return name;
  return null;
}
