import type { Bank } from "@/lib/labels";
import type { BankParser } from "../types";
import { ingParser } from "./ing";
import { revolutParser } from "./revolut";

// A Caixa entra quando houver um extrato real em samples/caixa.
export const PARSERS: BankParser[] = [revolutParser, ingParser];

export function detectParser(text: string): BankParser | null {
  return PARSERS.find((p) => p.detect(text)) ?? null;
}

export function parserForBank(bank: Bank): BankParser | null {
  return PARSERS.find((p) => p.bank === bank) ?? null;
}
