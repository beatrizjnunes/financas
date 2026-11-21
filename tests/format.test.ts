import { describe, expect, it } from "vitest";
import { formatDate, formatEUR, parseAmountToCents } from "@/lib/format";

describe("formatEUR", () => {
  it("usa ponto nos milhares e vírgula nos cêntimos", () => {
    expect(formatEUR(123456)).toBe("1.234,56 €");
    expect(formatEUR(298550)).toBe("2.985,50 €");
    expect(formatEUR(123456789)).toBe("1.234.567,89 €");
    expect(formatEUR(5)).toBe("0,05 €");
    expect(formatEUR(0)).toBe("0,00 €");
  });
  it("mostra o sinal", () => {
    expect(formatEUR(-367)).toBe("−3,67 €");
    expect(formatEUR(10000, { sign: true })).toBe("+100,00 €");
  });
});

describe("parseAmountToCents", () => {
  it("lê formatos com ponto decimal", () => {
    expect(parseAmountToCents("-3.67", ".")).toBe(-367);
    expect(parseAmountToCents("2985.50", ".")).toBe(298550);
    expect(parseAmountToCents("0.1", ".")).toBe(10);
  });
  it("lê formatos com vírgula decimal", () => {
    expect(parseAmountToCents("1.234,56", ",")).toBe(123456);
    expect(parseAmountToCents("-12,00 €", ",")).toBe(-1200);
  });
  it("não tem erros de vírgula flutuante", () => {
    expect(parseAmountToCents("153.95", ".")).toBe(15395);
    expect(parseAmountToCents("1.005", ".")).toBe(101);
  });
  it("rejeita lixo", () => {
    expect(() => parseAmountToCents("abc", ".")).toThrow();
    expect(() => parseAmountToCents("", ".")).toThrow();
  });
});

it("formatDate → dd/mm/aaaa", () => {
  expect(formatDate("2026-09-04 18:00:28")).toBe("04/09/2026");
});
