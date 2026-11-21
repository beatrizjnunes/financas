import Papa from "papaparse";
import { parseAmountToCents } from "@/lib/format";
import { type BankParser, type ParsedRow, ParseError, type SkippedRow } from "../types";
import { firstLine, titleCaseIfShouting, withoutVia } from "./text";

// Formato construído a partir de samples/ing (exportações CSV em inglês, ago–out 2026). O ING tem duas variantes:
// separada por ";" com o saldo após cada movimento, e separada por "," sem saldo. Os valores usam sempre vírgula decimal.
// A exportação em neerlandês ("Datum";"Naam / Omschrijving";…) tem outros cabeçalhos e ainda não é suportada.
const HEADER = [
  "Date",
  "Name / Description",
  "Account",
  "Counterparty",
  "Code",
  "Debit/credit",
  "Amount (EUR)",
  "Transaction type",
  "Notifications",
] as const;

type IngRecord = Record<(typeof HEADER)[number], string> & { "Resulting balance"?: string };

/** ";" ou ",", conforme o separador entre as colunas do cabeçalho. */
function delimiterOf(text: string): ";" | "," {
  const header = firstLine(text);
  return header.split(";").length > header.split(",").length ? ";" : ",";
}

const isCard = (notifications: string) => /^Card (?:no|sequence no\.?):/i.test(notifications.trim());

/**
 * Data e hora em que se pagou com o cartão, que vem nas notificações:
 * "Card no: … Date: 30/10/2026 Time: 18:26 …" ou "Card sequence no.: 900 26/10/2026 12:15 …".
 */
function cardDateTime(notifications: string): string | null {
  const m = notifications.match(/(\d{2})\/(\d{2})\/(\d{4})(?: Time:)? (\d{2}):(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:00` : null;
}

/** "ALBERT HEIJN 2216 ROTTERDAM NLD" → "Albert Heijn"; "BCK*AH to go EHV 5816 EINDHOVEN" → "AH to go". */
export function cleanIngCardName(raw: string): string {
  const d = raw.trim();
  if (/^Revolut\*/i.test(d)) return "Carregamento Revolut";
  if (/\bwww\.ovpay\.nl$/i.test(d)) return "OVpay";
  const s = d
    .replace(/^(?:BCK|CCV|SumUp|ZTL)\s*\*\s*/i, "") // prefixo do terminal de pagamento
    .replace(/(\S\s+\S+)\s+[A-Z]{3}$/, "$1") // país: NLD, IRL, GBR…
    .replace(/\s+\d{3,5}\b.*$/, "") // n.º da loja e cidade
    .replace(/\s+(\S+)\s+\1$/i, " $1") // cidade repetida: "IKEA BARENDRECHT BARENDRECHT"
    .replace(/^(.*\p{Ll}.*?)\s+\p{Lu}{3,}$/u, "$1"); // cidade em maiúsculas: "Breda University as BREDA"
  return titleCaseIfShouting(s || d);
}

/** Separa o destinatário/ordenante das transferências e débitos diretos. */
export function cleanIngName(raw: string): { description: string; counterparty: string } {
  const who = raw.trim().replace(/^(?:Hr|Mw|Dhr|Mevr)\.?\s+/, "");
  return { description: titleCaseIfShouting(withoutVia(who)), counterparty: titleCaseIfShouting(who) };
}

const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export const ingParser: BankParser = {
  id: "ing-csv",
  bank: "ing",
  ofBank: "do ING",

  detect(text) {
    const cols = firstLine(text)
      .split(delimiterOf(text))
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    return HEADER.every((h) => cols.includes(h));
  },

  parse(text) {
    if (!this.detect(text)) throw new ParseError("Este ficheiro não parece ser um extrato do ING.");
    const res = Papa.parse<IngRecord>(text.replace(/^﻿/, ""), {
      header: true,
      delimiter: delimiterOf(text),
      skipEmptyLines: true,
    });
    if (res.errors.length) {
      const e = res.errors[0];
      throw new ParseError(`Não consegui ler a linha ${(e.row ?? 0) + 2}: ${e.message}`);
    }

    const rows: ParsedRow[] = [];
    const skipped: SkippedRow[] = [];

    res.data.forEach((r, i) => {
      const line = i + 2;
      const name = r["Name / Description"]?.trim() ?? "";
      const notes = r.Notifications ?? "";
      if (!/^\d{8}$/.test(r.Date)) throw new ParseError(`Data inválida na linha ${line}: "${r.Date}"`);
      if (r["Debit/credit"] !== "Debit" && r["Debit/credit"] !== "Credit") {
        throw new ParseError(`Não sei se a linha ${line} é débito ou crédito: "${r["Debit/credit"]}"`);
      }

      const abs = parseAmountToCents(r["Amount (EUR)"], ",");
      const amount = r["Debit/credit"] === "Debit" ? -abs : abs;
      const card = isCard(notes);
      const fee = r.Code === "DV" && /^Kosten\b/i.test(name) && amount < 0;

      const { description, counterparty } = fee
        ? { description: `Comissão ${name.replace(/^Kosten\s+/i, "")}`, counterparty: null }
        : card
          ? { description: cleanIngCardName(name), counterparty: null }
          : cleanIngName(name);

      rows.push({
        date: (card && cardDateTime(notes)) || `${ymd(r.Date)} 00:00:00`,
        bookedAt: ymd(r.Date),
        descriptionOriginal: name,
        description,
        counterparty,
        bankType: r["Transaction type"] || r.Code || null,
        amountCents: amount,
        feeCents: fee ? -amount : 0,
        originalAmountCents: null,
        originalCurrency: null,
        balanceCents: r["Resulting balance"] ? parseAmountToCents(r["Resulting balance"], ",") : null,
      });
    });

    // O ING exporta do mais recente para o mais antigo; aqui fica por ordem cronológica, como na Revolut.
    if (rows.length > 1 && rows[0].bookedAt! > rows.at(-1)!.bookedAt!) rows.reverse();
    return { rows, skipped };
  },
};
