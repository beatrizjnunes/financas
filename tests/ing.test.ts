import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanIngCardName, cleanIngName, ingParser } from "@/server/import/parsers/ing";
import { detectParser } from "@/server/import/parsers";
import { revolutParser } from "@/server/import/parsers/revolut";
import { suggestCategoryName, suggestScope } from "@/server/import/classify";
import { hashRows } from "@/server/import/hash";

const csv = readFileSync(new URL("./fixtures/ing.csv", import.meta.url), "utf8");
const revolutCsv = readFileSync(new URL("./fixtures/revolut.csv", import.meta.url), "utf8");

describe("ING: deteção", () => {
  it("reconhece o CSV do ING", () => {
    expect(ingParser.detect(csv)).toBe(true);
    expect(detectParser(csv)?.bank).toBe("ing");
  });
  it("aceita BOM e CRLF", () => {
    expect(ingParser.detect("﻿" + csv.replace(/\n/g, "\r\n"))).toBe(true);
    expect(ingParser.parse("﻿" + csv.replace(/\n/g, "\r\n")).rows).toHaveLength(91);
  });
  it("não confunde com a Revolut", () => {
    expect(revolutParser.detect(csv)).toBe(false);
    expect(ingParser.detect(revolutCsv)).toBe(false);
  });
  it("rejeita a exportação em neerlandês com mensagem clara", () => {
    const nl = '"Datum";"Naam / Omschrijving";"Rekening"\n"20260101";"Albert Heijn";"NL00"';
    expect(ingParser.detect(nl)).toBe(false);
    expect(() => ingParser.parse(nl)).toThrow(/não parece ser um extrato do ING/);
  });
});

describe("ING: leitura", () => {
  const { rows, skipped } = ingParser.parse(csv);
  const find = (s: string) => rows.find((r) => r.descriptionOriginal.startsWith(s))!;

  it("lê todos os movimentos, do mais antigo para o mais recente", () => {
    expect(rows).toHaveLength(91);
    expect(skipped).toHaveLength(0);
    expect(rows[0].bookedAt).toBe("2026-09-01");
    expect(rows.at(-1)!.bookedAt).toBe("2026-10-31");
  });

  it("nos pagamentos com cartão usa a data e hora do pagamento, não a de lançamento", () => {
    const hema = find("HEMA");
    expect(hema.date).toBe("2026-10-30 18:26:00");
    expect(hema.bookedAt).toBe("2026-10-31");
    expect(hema.amountCents).toBe(-2198);
    // formato antigo das notificações: "Card sequence no.: 900 25/10/2026 16:35"
    expect(find("Albert Heijn 1342").date).toBe("2026-10-25 16:35:00");
  });

  it("sem hora nas notificações usa a data de lançamento", () => {
    expect(find("EVIDES").date).toBe("2026-10-27 00:00:00");
  });

  it("débitos negativos, créditos positivos", () => {
    expect(find("Ziggo").amountCents).toBe(-7441);
    expect(find("Amazon Marketplace").amountCents).toBe(1770);
  });

  it("os custos da conta são comissões", () => {
    const fee = find("Kosten ING Go");
    expect(fee.amountCents).toBe(-400);
    expect(fee.feeCents).toBe(400);
    expect(fee.description).toBe("Comissão ING Go");
  });

  it("os saldos batem certo linha a linha (saldo anterior + valor)", () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].balanceCents).toBe(rows[i - 1].balanceCents! + rows[i].amountCents);
    }
  });

  it("o total do período bate com a diferença de saldos", () => {
    const sum = rows.reduce((s, r) => s + r.amountCents, 0);
    const opening = rows[0].balanceCents! - rows[0].amountCents;
    expect(opening).toBe(75275);
    expect(opening + sum).toBe(rows.at(-1)!.balanceCents);
    expect(rows.at(-1)!.balanceCents).toBe(2783);
  });
});

describe("ING: exportação separada por vírgulas (sem saldo)", () => {
  // A mesma exportação, no formato "," do ING: sem as colunas "Resulting balance" e "Tag".
  const commas = csv
    .trim()
    .split("\n")
    .map((line) => line.split('";"').slice(0, 9).join('","') + '"')
    .join("\n");
  const semi = ingParser.parse(csv).rows;

  it("deteta e lê os mesmos movimentos", () => {
    expect(ingParser.detect(commas)).toBe(true);
    expect(detectParser(commas)?.bank).toBe("ing");
    const { rows } = ingParser.parse(commas);
    expect(rows).toHaveLength(91);
    expect(rows.map((r) => ({ ...r, balanceCents: null }))).toEqual(semi.map((r) => ({ ...r, balanceCents: null })));
    expect(rows.every((r) => r.balanceCents === null)).toBe(true);
  });

  it("importar num formato e depois no outro não duplica nada", () => {
    expect(hashRows("acc", ingParser.parse(commas).rows)).toEqual(hashRows("acc", semi));
  });
});

describe("ING: descrições", () => {
  it.each([
    ["ALBERT HEIJN 2216 ROTTERDAM NLD", "Albert Heijn"],
    ["Albert Heijn 4194 Rott ROTTERDAM", "Albert Heijn"],
    ["BCK*AH to go EHV 5816 EINDHOVEN", "AH to go"],
    ["CCV*Doenerland B.V. BREDA NLD", "Doenerland B.V."],
    ["IKEA BARENDRECHT BARENDRECHT NLD", "Ikea Barendrecht"],
    ["Kanarie Club AMSTERDAM NLD", "Kanarie Club"],
    ["TEMU.COM DUBLIN 2 IRL", "Temu.com Dublin 2"],
    ["NLOVMQJANW8AENA567 www.ovpay.nl", "OVpay"],
    ["Revolut**1552* Dublin IRL", "Carregamento Revolut"],
  ])("cartão: %s → %s", (raw, expected) => {
    expect(cleanIngCardName(raw)).toBe(expected);
  });

  it.each([
    ["Amigo Um via Tikkie", "Amigo Um", "Amigo Um via Tikkie"],
    ["Hr A Exemplo", "A Exemplo", "A Exemplo"],
    ["FAMILIAR EXEMPLO", "Familiar Exemplo", "Familiar Exemplo"],
    ["Ziggo Services B.V.", "Ziggo Services B.V.", "Ziggo Services B.V."],
  ])("transferência: %s", (raw, description, counterparty) => {
    expect(cleanIngName(raw)).toEqual({ description, counterparty });
  });
});

describe("ING: âmbito e categoria", () => {
  const { rows } = ingParser.parse(csv);
  const ivo = { ownNames: ["Pessoa Ivo"], partnerNames: ["Pessoa Bea"] };
  const cat = (s: string) => {
    const r = rows.find((x) => x.descriptionOriginal.startsWith(s))!;
    return [suggestScope(r, ivo), suggestCategoryName(r, suggestScope(r, ivo))];
  };

  it.each([
    ["Revolut**", "interna", "Transferências"],
    ["ALBERT HEIJN 2216 ROTTERDAM NLD", "casal", "Supermercado"], // segunda, 19:35
    ["Albert Heijn 1382 BREDA NLD", "pessoal", "Supermercado"], // dia útil, à hora de almoço
    ["NLOV", "pessoal", "Transportes"],
    ["Ziggo", "pessoal", "Internet e telemóvel"],
    ["EVIDES", "pessoal", "Contas da casa"],
    ["Kosten ING Go", "pessoal", "Comissões bancárias"],
    ["Amazon Marketplace", "pessoal", "Outras receitas"],
  ])("%s → %s / %s", (desc, scope, category) => {
    expect(cat(desc)).toEqual([scope, category]);
  });
});
