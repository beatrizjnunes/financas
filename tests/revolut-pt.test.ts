import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanRevolutDescription, revolutParser } from "@/server/import/parsers/revolut";
import { detectParser } from "@/server/import/parsers";
import { caixaParser } from "@/server/import/parsers/caixa";
import { ingParser } from "@/server/import/parsers/ing";
import { suggestCategoryName, suggestScope } from "@/server/import/classify";

// Exportação da Revolut em português (pt-pt), anonimizada.
const csv = readFileSync(new URL("./fixtures/revolut-pt.csv", import.meta.url), "utf8");

describe("Revolut em português: deteção", () => {
  it("reconhece o extrato, com BOM e CRLF", () => {
    expect(revolutParser.detect(csv)).toBe(true);
    expect(revolutParser.detect("﻿" + csv.replace(/\n/g, "\r\n"))).toBe(true);
    expect(detectParser(csv)?.bank).toBe("revolut");
  });
  it("não confunde com os outros bancos", () => {
    expect(ingParser.detect(csv)).toBe(false);
    expect(caixaParser.detect(csv)).toBe(false);
  });
});

describe("Revolut em português: leitura", () => {
  const { rows, skipped } = revolutParser.parse(csv);

  it("importa as concluídas e põe de parte as pendentes", () => {
    expect(rows).toHaveLength(21);
    expect(skipped.map((s) => s.description)).toEqual(["Amazon", "Trading 212"]);
    expect(skipped[0].reason).toMatch(/Pendente/);
  });

  it("traduz os tipos para os mesmos valores da versão inglesa", () => {
    expect(rows[0].bankType).toBe("Topup");
    expect(rows.find((r) => r.descriptionOriginal === "fordeal.com")!.bankType).toBe("Card Payment");
    expect(rows.find((r) => r.amountCents === 26400)!.bankType).toBe("Card Refund");
  });

  it("usa a data de início e desconta a comissão", () => {
    const klm = rows.find((r) => r.descriptionOriginal.startsWith("KLM"))!;
    expect(klm).toMatchObject({ date: "2026-09-28 19:56:34", bookedAt: "2026-10-01 10:11:06", amountCents: -22548 });
    const fee = rows.find((r) => r.bankType === "Charge")!;
    expect(fee).toMatchObject({ amountCents: -2079, feeCents: 2079, description: "Comissão Revolut: Comissão por emissão de cartão" });
  });

  it("os saldos batem certo linha a linha", () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i].balanceCents).toBe(rows[i - 1].balanceCents! + rows[i].amountCents);
    expect(rows.at(-1)!.balanceCents).toBe(521927);
  });
});

describe("Revolut em português: descrições e classificação", () => {
  it.each([
    ["Transferência imediata SEPA+ para Pessoa Bea", "Pessoa Bea", "Pessoa Bea"],
    ["Transferência imediata intrabancária para PESSOA IVO", "Pessoa Ivo", "Pessoa Ivo"],
    ["Transferência imediata intrabancária de PESSOA IVO", "Pessoa Ivo", "Pessoa Ivo"],
    ["Transferência a crédito SEPA+ para My Way via Stichting Mollie Payments", "My Way", "My Way via Stichting Mollie Payments"],
    ["Carregamento de EMPRESA EXEMPLO BV", "Empresa Exemplo Bv", "Empresa Exemplo Bv"],
    ["Carregamento com Apple Pay através de *0000", "Carregamento Apple Pay *0000", null],
    ["Swapfiets*London", "Swapfiets*London", null],
  ])("%s", (raw, description, counterparty) => {
    expect(cleanRevolutDescription(raw)).toEqual({ description, counterparty });
  });

  const { rows } = revolutParser.parse(csv);
  const bea = { ownNames: ["Pessoa Bea"], partnerNames: ["PESSOA IVO EXEMPLO"] };
  const by = (s: string) => rows.find((r) => r.descriptionOriginal.startsWith(s))!;

  it("transferências para o próprio, para o parceiro e carregamentos Apple Pay", () => {
    expect(suggestScope(by("Transferência imediata SEPA+ para Pessoa Bea"), bea)).toBe("interna");
    expect(suggestScope(by("Transferência imediata intrabancária de PESSOA IVO"), bea)).toBe("entre_nos");
    expect(suggestScope(by("Transferência imediata intrabancária para PESSOA IVO"), bea)).toBe("entre_nos");
    expect(suggestScope(by("Carregamento com Apple Pay"), bea)).toBe("interna");
  });
  it("dinheiro para investir não é despesa", () => {
    expect(suggestScope(by("Transferência imediata SEPA+ para Go And Grow"), bea)).toBe("interna");
  });
  it("categorias", () => {
    expect(suggestCategoryName(by("Transferência a crédito SEPA+ para NS Reizigers"), "pessoal")).toBe("Transportes");
    expect(suggestCategoryName(by("KLM"), "pessoal")).toBe("Viagens");
    expect(suggestCategoryName(by("Lidl"), "pessoal")).toBe("Supermercado");
    expect(suggestCategoryName(by("MediaMarkt"), "pessoal")).toBe("Compras online");
  });
});
