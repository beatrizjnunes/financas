import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caixaParser, cleanCaixaName } from "@/server/import/parsers/caixa";
import { detectParser } from "@/server/import/parsers";
import { ingParser } from "@/server/import/parsers/ing";
import { revolutParser } from "@/server/import/parsers/revolut";
import { suggestCategoryName, suggestScope } from "@/server/import/classify";
import { hashRows } from "@/server/import/hash";

const csv = readFileSync(new URL("./fixtures/caixa.csv", import.meta.url), "utf8");
// O ficheiro real vem em Windows-1252: lido como UTF-8, os acentos aparecem como "�".
const mojibake = csv.replace(/[àíçãá]/g, "�");

describe("Caixa: deteção", () => {
  it("reconhece o extrato, mesmo com a codificação errada, BOM ou CRLF", () => {
    expect(caixaParser.detect(csv)).toBe(true);
    expect(caixaParser.detect(mojibake)).toBe(true);
    expect(caixaParser.detect("﻿" + csv.replace(/\n/g, "\r\n"))).toBe(true);
    expect(detectParser(csv)?.bank).toBe("caixa");
  });
  it("não confunde com os outros bancos", () => {
    expect(ingParser.detect(csv)).toBe(false);
    expect(revolutParser.detect(csv)).toBe(false);
    expect(caixaParser.detect(readFileSync(new URL("./fixtures/ing.csv", import.meta.url), "utf8"))).toBe(false);
  });
});

describe("Caixa: leitura", () => {
  const { rows, skipped } = caixaParser.parse(mojibake);

  it("lê todas as linhas e ignora o rodapé do saldo", () => {
    expect(rows).toHaveLength(25);
    expect(skipped).toHaveLength(0);
  });

  it("fica por ordem cronológica, com débitos negativos e créditos positivos", () => {
    expect(rows[0]).toMatchObject({ date: "2026-10-19 00:00:00", bookedAt: "2026-10-21", amountCents: -897, balanceCents: 51915 });
    expect(rows.at(-1)).toMatchObject({ amountCents: 566, balanceCents: 2115, description: "Reembolso Shein.com", bankType: "DEPOSITO" });
  });

  it("a data é a data-valor (dia da compra), a do banco fica em bookedAt", () => {
    const primark = rows.find((r) => r.descriptionOriginal.startsWith("PRIMARK"))!;
    expect(primark.date).toBe("2026-10-17 00:00:00");
    expect(primark.bookedAt).toBe("2026-10-28");
  });

  it("os saldos batem certo linha a linha", () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i].balanceCents! - rows[i - 1].balanceCents!).toBe(rows[i].amountCents);
  });

  it("movimentos iguais no mesmo dia têm hashes diferentes", () => {
    const hashes = hashRows("conta", rows);
    expect(new Set(hashes).size).toBe(rows.length);
  });
});

describe("Caixa: nomes e classificação", () => {
  it("limpa os nomes", () => {
    expect(cleanCaixaName("ALBERT HEIJN 4194 ROT ").description).toBe("Albert Heijn");
    expect(cleanCaixaName("HEMA EV0003 ROTTERDAM ").description).toBe("Hema");
    expect(cleanCaixaName("PIPOOS R DAM CENTRUM ").description).toBe("Pipoos");
    expect(cleanCaixaName("JOE  THE JUICE NETHER ").description).toBe("Joe The Juice");
    expect(cleanCaixaName("CAR WAL REVOLUT  6408 ").description).toBe("Carregamento Revolut");
    expect(cleanCaixaName("Trf Mbway 931XXX136 ").description).toBe("MB WAY 931XXX136");
    expect(cleanCaixaName("PAYPAL  OPENAI  CHATG ").description).toBe("Openai Chatg (PayPal)");
    expect(cleanCaixaName("TFI Pessoa Bea Silva N ")).toEqual({ description: "Transferência de Pessoa Bea Silva N", counterparty: "Pessoa Bea Silva N" });
  });

  const { rows } = caixaParser.parse(csv);
  const bea = { ownNames: ["PESSOA BEA SILVA NUNES"], partnerNames: ["Pessoa Ivo"] };
  const by = (start: string) => rows.find((r) => r.descriptionOriginal.startsWith(start))!;

  it("transferências do próprio (nome cortado pelo banco) e carregamentos Revolut são internas", () => {
    expect(suggestScope(by("TFI"), bea)).toBe("interna");
    expect(suggestScope(by("CAR WAL REVOLUT"), bea)).toBe("interna");
  });
  it("um nome curto demais não é confundido", () => {
    expect(suggestScope({ ...by("TFI"), counterparty: "Pessoa" }, bea)).toBe("pessoal");
  });
  it("sugere categorias", () => {
    expect(suggestCategoryName(by("PAYPAL"), "pessoal")).toBe("Subscrições");
    expect(suggestCategoryName(by("SHEIN"), "pessoal")).toBe("Compras online");
    expect(suggestCategoryName(by("CINNABON"), "pessoal")).toBe("Cafés e snacks");
    expect(suggestCategoryName(by("ZARA"), "pessoal")).toBe("Roupa e compras");
    expect(suggestCategoryName(by("AH 4194"), "pessoal")).toBe("Supermercado");
  });
});
