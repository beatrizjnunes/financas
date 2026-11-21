import Papa from "papaparse";
import { parseAmountToCents } from "@/lib/format";
import { type BankParser, type ParsedRow, ParseError, type SkippedRow } from "../types";
import { firstLine, titleCaseIfShouting, withoutVia } from "./text";

// Formato construído a partir de exportações CSV reais da Revolut, em inglês e em português (pt-pt).
// As duas línguas têm as mesmas colunas; a portuguesa é traduzida para os nomes/valores ingleses antes de ler.
const HEADER = ["Type", "Product", "Started Date", "Completed Date", "Description", "Amount", "Fee", "Currency", "State", "Balance"];

type RevolutRecord = Record<(typeof HEADER)[number], string>;

/** Cabeçalhos da exportação em português → nomes ingleses. */
const HEADER_PT: Record<string, (typeof HEADER)[number]> = {
  Tipo: "Type",
  Produto: "Product",
  "Data de início": "Started Date",
  "Data de Conclusão": "Completed Date",
  Descrição: "Description",
  Montante: "Amount",
  Comissão: "Fee",
  Moeda: "Currency",
  Estado: "State",
  Saldo: "Balance",
};

const STATE_PT: Record<string, string> = { "CONCLUÍDA": "COMPLETED", PENDENTE: "PENDING", REVERTIDA: "REVERTED", RECUSADA: "DECLINED" };
const PRODUCT_PT: Record<string, string> = { Atual: "Current", Poupança: "Savings", Depósito: "Deposit" };
const TYPE_PT: Record<string, string> = {
  "Pagamento com cartão": "Card Payment",
  Carregamento: "Topup",
  Transferência: "Transfer",
  Cobrança: "Charge",
  "Devolução do cartão de débito": "Card Refund",
  Câmbio: "Exchange",
  "Pagamento Revolut": "Revolut Payment",
  Recompensa: "Reward",
  Juros: "Interest",
};

const headerCols = (text: string) => firstLine(text).split(",").map((c) => c.trim());
const isPortuguese = (text: string) => Object.keys(HEADER_PT).every((h) => headerCols(text).includes(h));

/** Separa o destinatário/ordenante e cria uma descrição legível. */
export function cleanRevolutDescription(raw: string): { description: string; counterparty: string | null } {
  const d = raw.trim();
  // Para alguém: "To X", "SEPA+ instant transfer to X" ou, em português, "Transferência imediata SEPA+ para X",
  // "Transferência a crédito SEPA+ para X", "Transferência imediata intrabancária para X".
  let m =
    d.match(/^(?:(?:SEPA\+? (?:instant |credit )?transfer|Intrabank (?:instant )?transfer) to|To) (.+)$/i) ??
    d.match(/^(?:Transferência (?:imediata |a crédito )?(?:SEPA\+?|intrabancária)(?: imediata)? para|Para) (.+)$/i);
  if (m) {
    const who = titleCaseIfShouting(withoutVia(m[1]));
    return { description: who, counterparty: titleCaseIfShouting(m[1].trim()) };
  }
  // De alguém: "Payment from X", "Transfer from X", "Transferência imediata intrabancária de X", "Carregamento de X".
  m =
    d.match(/^(?:Payment|Transfer) from (.+)$/i) ??
    d.match(/^(?:Transferência (?:imediata |a crédito )?(?:SEPA\+?|intrabancária)(?: imediata)? de|Pagamento de|Carregamento de) (.+)$/i);
  if (m) {
    const who = titleCaseIfShouting(m[1].trim());
    return { description: who, counterparty: who };
  }
  if (/^(?:SEPA\+? credit transfer|Transferência a crédito SEPA\+?)$/i.test(d)) {
    return { description: "Transferência SEPA (sem destinatário)", counterparty: null };
  }
  m = d.match(/^(?:Apple Pay top-up by|Carregamento com Apple Pay através de) (\*\d+)$/i);
  if (m) return { description: `Carregamento Apple Pay ${m[1]}`, counterparty: null };
  return { description: d, counterparty: null };
}

export const revolutParser: BankParser = {
  id: "revolut-csv",
  bank: "revolut",
  ofBank: "da Revolut",

  detect(text) {
    return HEADER.every((h) => headerCols(text).includes(h)) || isPortuguese(text);
  },

  parse(text) {
    if (!this.detect(text)) throw new ParseError("Este ficheiro não parece ser um extrato da Revolut.");
    const pt = isPortuguese(text);
    const res = Papa.parse<RevolutRecord>(text.replace(/^﻿/, ""), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => (pt ? (HEADER_PT[h.trim()] ?? h.trim()) : h.trim()),
    });
    if (res.errors.length) {
      const e = res.errors[0];
      throw new ParseError(`Não consegui ler a linha ${(e.row ?? 0) + 2}: ${e.message}`);
    }

    const rows: ParsedRow[] = [];
    const skipped: SkippedRow[] = [];

    res.data.forEach((raw, i) => {
      // Em português, os valores de Tipo/Produto/Estado também são traduzidos para os ingleses.
      const r: RevolutRecord = pt
        ? {
            ...raw,
            Type: TYPE_PT[raw.Type] ?? raw.Type,
            Product: PRODUCT_PT[raw.Product] ?? raw.Product,
            State: STATE_PT[raw.State] ?? raw.State,
          }
        : raw;
      const line = i + 2;
      const desc = r.Description?.trim() ?? "";
      if (r.State !== "COMPLETED") {
        const reason =
          r.State === "PENDING" ? "Pendente — entra numa próxima importação, quando estiver concluída" : `Estado ${raw.State}`;
        skipped.push({ line, description: desc, reason });
        return;
      }
      if (r.Currency !== "EUR") {
        skipped.push({ line, description: desc, reason: `Moeda ${r.Currency} ainda não suportada` });
        return;
      }
      if (r.Product !== "Current") {
        skipped.push({ line, description: desc, reason: `Produto "${raw.Product}" ainda não suportado` });
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
