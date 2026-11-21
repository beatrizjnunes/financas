import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanRevolutDescription, revolutParser } from "@/server/import/parsers/revolut";
import { detectParser } from "@/server/import/parsers";

const csv = readFileSync(new URL("./fixtures/revolut.csv", import.meta.url), "utf8");

describe("Revolut: deteção", () => {
  it("reconhece o CSV da Revolut", () => {
    expect(revolutParser.detect(csv)).toBe(true);
    expect(detectParser(csv)?.bank).toBe("revolut");
  });
  it("aceita BOM e CRLF", () => {
    expect(revolutParser.detect("﻿" + csv.replace(/\n/g, "\r\n"))).toBe(true);
  });
  it("rejeita outros ficheiros com mensagem clara", () => {
    const other = "Datum;Naam / Omschrijving;Rekening\n20260101;Albert Heijn;NL00";
    expect(revolutParser.detect(other)).toBe(false);
    expect(() => revolutParser.parse(other)).toThrow(/não parece ser um extrato da Revolut/);
  });
});

describe("Revolut: leitura", () => {
  const { rows, skipped } = revolutParser.parse(csv);

  it("importa as concluídas e põe de parte as pendentes", () => {
    expect(rows).toHaveLength(56);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].description).toBe("Normal");
    expect(skipped[0].reason).toMatch(/Pendente/);
  });

  it("usa a data de início (quando pagaste), não a de conclusão", () => {
    const klm = rows.find((r) => r.descriptionOriginal.startsWith("KLM"))!;
    expect(klm.date).toBe("2026-09-28 19:56:34");
    expect(klm.bookedAt).toBe("2026-10-01 10:11:06");
    expect(klm.amountCents).toBe(-22548);
  });

  it("desconta comissões no valor líquido", () => {
    const fee = rows.find((r) => r.bankType === "Charge")!;
    expect(fee.amountCents).toBe(-2079);
    expect(fee.feeCents).toBe(2079);
    expect(fee.description).toBe("Comissão Revolut: Card orders fee");
  });

  it("os saldos batem certo linha a linha (saldo anterior + valor líquido)", () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].balanceCents).toBe(rows[i - 1].balanceCents! + rows[i].amountCents);
    }
  });

  it("o total do período bate com a diferença de saldos", () => {
    const sum = rows.reduce((s, r) => s + r.amountCents, 0);
    const opening = rows[0].balanceCents! - rows[0].amountCents;
    expect(opening + sum).toBe(rows.at(-1)!.balanceCents);
    expect(rows.at(-1)!.balanceCents).toBe(128455);
  });
});

describe("Revolut: descrições", () => {
  it.each([
    ["SEPA+ instant transfer to Pessoa Bea", "Pessoa Bea", "Pessoa Bea"],
    ["Intrabank instant transfer to PESSOA IVO", "Pessoa Ivo", "Pessoa Ivo"],
    ["SEPA+ credit transfer to My Way via Stichting Mollie Payments", "My Way", "My Way via Stichting Mollie Payments"],
    ["Payment from EMPRESA EXEMPLO BV", "Empresa Exemplo Bv", "Empresa Exemplo Bv"],
    ["To Pessoa Bea", "Pessoa Bea", "Pessoa Bea"],
    ["To NAC Breda B.V. via CM.com", "NAC Breda B.V.", "NAC Breda B.V. via CM.com"],
    ["Transfer from PESSOA BEA", "Pessoa Bea", "Pessoa Bea"],
    ["SEPA+ credit transfer", "Transferência SEPA (sem destinatário)", null],
    ["Apple Pay top-up by *0000", "Carregamento Apple Pay *0000", null],
    ["Albert Heijn", "Albert Heijn", null],
  ])("%s", (raw, description, counterparty) => {
    expect(cleanRevolutDescription(raw)).toEqual({ description, counterparty });
  });
});
