import type { Bank } from "@/lib/labels";

export type ParsedRow = {
  /** "YYYY-MM-DD HH:MM:SS" — data em que a operação foi feita. */
  date: string;
  bookedAt: string | null;
  descriptionOriginal: string;
  description: string;
  counterparty: string | null;
  bankType: string | null;
  /** Líquido, em cêntimos de EUR, já com comissões. */
  amountCents: number;
  feeCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  balanceCents: number | null;
};

export type SkippedRow = { line: number; description: string; reason: string };

export type ParseResult = { rows: ParsedRow[]; skipped: SkippedRow[] };

export type BankParser = {
  id: string;
  bank: Bank;
  /** Nome para mensagens: "da Revolut", "do ING", "da Caixa". */
  ofBank: string;
  detect(text: string): boolean;
  parse(text: string): ParseResult;
};

export class ParseError extends Error {}
