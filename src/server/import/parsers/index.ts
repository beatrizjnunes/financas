import type { Bank } from "@/lib/labels";
import type { BankParser } from "../types";
import { caixaParser } from "./caixa";
import { ingParser } from "./ing";
import { revolutParser } from "./revolut";

export const PARSERS: BankParser[] = [revolutParser, ingParser, caixaParser];

export function detectParser(text: string): BankParser | null {
  return PARSERS.find((p) => p.detect(text)) ?? null;
}

export function parserForBank(bank: Bank): BankParser | null {
  return PARSERS.find((p) => p.bank === bank) ?? null;
}
