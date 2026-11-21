import { parseAmountToCents } from "@/lib/format";
import { type BankParser, type ParsedRow, ParseError, type SkippedRow } from "../types";
import { titleCaseIfShouting } from "./text";

// Formato da Caixa Geral de Depósitos: "Consultar saldos e movimentos à ordem" exportado em CSV (separado por ";",
// codificação Windows-1252). Tem umas linhas de cabeçalho (conta, datas), depois:
//   Data mov. ;Data valor ;Descrição ;Débito ;Crédito ;Saldo contabilístico ;Saldo disponível ;Categoria ;
// com datas dd-mm-aaaa, vírgula decimal e o mais recente primeiro; no fim, uma linha com o saldo final.

/** Minúsculas, sem acentos e sem o "�" que aparece quando o ficheiro é lido com a codificação errada. */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/�/g, "")
    .toLowerCase()
    .trim();

const isHeader = (line: string) => {
  const n = norm(line);
  return n.startsWith("data mov") && n.includes("data valor") && n.includes("saldo cont");
};

const DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const ymd = (d: string) => d.replace(DATE, "$3-$2-$1");

/** Nome do comerciante sem n.º de loja nem cidade: "ALBERT HEIJN 4194 ROT" → "Albert Heijn". */
function merchant(s: string) {
  const out = s
    .replace(/\s+\S*\d\S*.*$/, "") // a partir do 1.º "token" com algarismos (n.º da loja, terminal…)
    .replace(/\s+(?:ROTTERDAM|ROT|R DAM|AMSTERDAM|EINDHOVEN|NETHER|LISBOA|PORTO|COIMBRA|BRAGA|FARO)\b.*$/i, "")
    .trim();
  return titleCaseIfShouting(out || s);
}

/** Descrição legível e contraparte (nas transferências) a partir do texto da Caixa. */
export function cleanCaixaName(raw: string): { description: string; counterparty: string | null } {
  const d = raw.replace(/\s+/g, " ").trim();
  let m: RegExpMatchArray | null;
  if ((m = d.match(/^TFI\s+(.+)$/i))) {
    const who = titleCaseIfShouting(m[1]);
    return { description: `Transferência de ${who}`, counterparty: who };
  }
  if ((m = d.match(/^TRF\.?\s+MB\s?WAY\s+(.+)$/i))) return { description: `MB WAY ${m[1]}`, counterparty: null };
  if ((m = d.match(/^(?:TRF|TRANSF)\.?\s+(.+)$/i))) {
    const who = titleCaseIfShouting(m[1]);
    return { description: `Transferência para ${who}`, counterparty: who };
  }
  if (/^CAR WAL REVOLUT\b/i.test(d)) return { description: "Carregamento Revolut", counterparty: null };
  if ((m = d.match(/^CRD VCHER\s+(.+)$/i))) return { description: `Reembolso ${merchant(m[1])}`, counterparty: null };
  if ((m = d.match(/^PAYPAL\s+(.+)$/i))) return { description: `${merchant(m[1])} (PayPal)`, counterparty: null };
  return { description: merchant(d), counterparty: null };
}

export const caixaParser: BankParser = {
  id: "caixa-csv",
  bank: "caixa",
  ofBank: "da Caixa",

  detect(text) {
    return text.split(/\r?\n/, 40).some(isHeader);
  },

  parse(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/);
    const h = lines.findIndex(isHeader);
    if (h < 0) throw new ParseError("Este ficheiro não parece ser um extrato da Caixa.");

    const rows: ParsedRow[] = [];
    const skipped: SkippedRow[] = [];
    for (let i = h + 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map((c) => c.trim());
      // Linhas em branco e o rodapé com o saldo final não começam por uma data.
      if (!DATE.test(cols[0] ?? "")) continue;
      const [mov, valor, desc = "", debit = "", credit = "", saldo = "", , category = ""] = cols;
      const line = i + 1;
      if (!debit && !credit) {
        skipped.push({ line, description: desc, reason: "Sem valor de débito nem de crédito" });
        continue;
      }
      let amount: number;
      try {
        amount = debit ? -Math.abs(parseAmountToCents(debit, ",")) : Math.abs(parseAmountToCents(credit, ","));
      } catch {
        throw new ParseError(`Valor inválido na linha ${line}: "${debit || credit}"`);
      }
      const { description, counterparty } = cleanCaixaName(desc);
      rows.push({
        // A data-valor é o dia da compra; a data do movimento é quando o banco a lançou.
        date: `${ymd(DATE.test(valor) ? valor : mov)} 00:00:00`,
        bookedAt: ymd(mov),
        descriptionOriginal: desc,
        description,
        counterparty,
        bankType: category || null,
        amountCents: amount,
        feeCents: 0,
        originalAmountCents: null,
        originalCurrency: null,
        balanceCents: saldo && DATE.test(mov) ? safeCents(saldo) : null,
      });
    }
    if (!rows.length && !skipped.length) throw new ParseError("O extrato da Caixa não tem movimentos neste período.");
    // A Caixa exporta do mais recente para o mais antigo; aqui fica por ordem cronológica.
    if (rows.length > 1 && rows[0].bookedAt! > rows.at(-1)!.bookedAt!) rows.reverse();
    return { rows, skipped };
  },
};

function safeCents(v: string) {
  try {
    return parseAmountToCents(v, ",");
  } catch {
    return null;
  }
}
