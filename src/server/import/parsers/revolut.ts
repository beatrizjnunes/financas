import Papa from "papaparse";
import { parseAmountToCents } from "@/lib/format";
import { type BankParser, type ParsedRow, ParseError, type SkippedRow } from "../types";
import { firstLine, titleCaseIfShouting, withoutVia } from "./text";

// Formato construído a partir de samples/revolut (exportações CSV em inglês da Bea e do Ivo, set–out 2026).
const HEADER = ["Type", "Product", "Started Date", "Completed Date", "Description", "Amount", "Fee", "Currency", "State", "Balance"];

type RevolutRecord = Record<(typeof HEADER)[number], string>;

/** Separa o destinatário/ordenante e cria uma descrição legível. */
export function cleanRevolutDescription(raw: string): { description: string; counterparty: string | null } {
  const d = raw.trim();
  // "To X" aparece nas transferências feitas pela app (ex.: "To NAC Breda B.V. via CM.com").
  let m = d.match(/^(?:(?:SEPA\+? (?:instant |credit )?transfer|Intrabank (?:instant )?transfer) to|To) (.+)$/i);
  if (m) {
    const who = titleCaseIfShouting(withoutVia(m[1]));
    return { description: who, counterparty: titleCaseIfShouting(m[1].trim()) };
  }
  m = d.match(/^(?:Payment|Transfer) from (.+)$/i);
  if (m) {
    const who = titleCaseIfShouting(m[1].trim());
    return { description: who, counterparty: who };
  }
  if (/^SEPA\+? credit transfer$/i.test(d)) {
    return { description: "Transferência SEPA (sem destinatário)", counterparty: null };
  }
  m = d.match(/^Apple Pay top-up by (\*\d+)$/i);
  if (m) return { description: `Carregamento Apple Pay ${m[1]}`, counterparty: null };
  return { description: d, counterparty: null };
}

export const revolutParser: BankParser = {
  id: "revolut-csv",
  bank: "revolut",
  ofBank: "da Revolut",

  detect(text) {
    const cols = firstLine(text).split(",").map((c) => c.trim());
    return HEADER.every((h) => cols.includes(h));
  },

  parse(text) {
    if (!this.detect(text)) throw new ParseError("Este ficheiro não parece ser um extrato da Revolut.");
    const res = Papa.parse<RevolutRecord>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
    if (res.errors.length) {
      const e = res.errors[0];
      throw new ParseError(`Não consegui ler a linha ${(e.row ?? 0) + 2}: ${e.message}`);
    }

    const rows: ParsedRow[] = [];
    const skipped: SkippedRow[] = [];

    res.data.forEach((r, i) => {
      const line = i + 2;
      const desc = r.Description?.trim() ?? "";
      if (r.State !== "COMPLETED") {
        const reason =
          r.State === "PENDING" ? "Pendente — entra numa próxima importação, quando estiver concluída" : `Estado ${r.State}`;
        skipped.push({ line, description: desc, reason });
        return;
      }
      if (r.Currency !== "EUR") {
        skipped.push({ line, description: desc, reason: `Moeda ${r.Currency} ainda não suportada` });
        return;
      }
      if (r.Product !== "Current") {
        skipped.push({ line, description: desc, reason: `Produto "${r.Product}" ainda não suportado` });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r["Started Date"])) {
        throw new ParseError(`Data inválida na linha ${line}: "${r["Started Date"]}"`);
      }

      const amount = parseAmountToCents(r.Amount, ".");
      const fee = parseAmountToCents(r.Fee || "0", ".");
      const { description, counterparty } =
        r.Type === "Charge" && amount === 0 && fee > 0
          ? { description: `Comissão Revolut: ${desc}`, counterparty: null }
          : cleanRevolutDescription(desc);

      rows.push({
        date: r["Started Date"],
        bookedAt: r["Completed Date"] || null,
        descriptionOriginal: desc,
        description,
        counterparty,
        bankType: r.Type,
        amountCents: amount - fee,
        feeCents: fee,
        originalAmountCents: null,
        originalCurrency: null,
        balanceCents: r.Balance ? parseAmountToCents(r.Balance, ".") : null,
      });
    });

    return { rows, skipped };
  },
};
