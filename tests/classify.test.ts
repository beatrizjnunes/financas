import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isWorkingHours, suggestCategoryName, suggestScope } from "@/server/import/classify";
import { revolutParser } from "@/server/import/parsers/revolut";

const { rows } = revolutParser.parse(readFileSync(new URL("./fixtures/revolut.csv", import.meta.url), "utf8"));
// O extrato de exemplo é da Bea.
const bea = { ownNames: ["Pessoa Bea"], partnerNames: ["PESSOA IVO"] };
const byDesc = (s: string) => rows.filter((r) => r.descriptionOriginal.includes(s));

describe("âmbito sugerido", () => {
  it("transferência para conta própria → interna", () => {
    const own = byDesc("transfer to Pessoa Bea");
    expect(own).toHaveLength(4);
    own.forEach((r) => expect(suggestScope(r, bea)).toBe("interna"));
  });

  it("carregamento com cartão próprio → interna", () => {
    expect(suggestScope(byDesc("Apple Pay top-up")[0], bea)).toBe("interna");
  });

  it("transferência para o parceiro → entre nós (ignora maiúsculas e acentos)", () => {
    byDesc("PESSOA IVO").forEach((r) => expect(suggestScope(r, bea)).toBe("entre_nos"));
    expect(suggestScope(byDesc("PESSOA IVO")[0], { ownNames: [], partnerNames: ["Pessóa Ivo"] })).toBe("entre_nos");
  });

  it("nomes encurtados pelo banco e transferências sem contraparte (ING)", () => {
    const people = { ownNames: ["BEATRIZ JACINTO NUNES"], partnerNames: ["IVO PINTO DUARTE"] };
    const base = { ...byDesc("Kruidvat")[0], amountCents: 71500 };
    const cp = (counterparty: string) => suggestScope({ ...base, counterparty }, people);
    expect(cp("Ivo Duarte")).toBe("entre_nos");
    expect(cp("Ivo Pinto Duarte")).toBe("entre_nos");
    expect(cp("Beatriz Jacinto N")).toBe("interna");
    expect(cp("Beatriz Nunes")).toBe("interna");
    expect(cp("Antonio Alexandre Oliveira Duarte")).toBe("pessoal");
    expect(cp("Ivo Silva")).toBe("pessoal");
    expect(cp("Ivo")).toBe("pessoal");
    const ing = { ownNames: ["IVO PINTO DUARTE"], partnerNames: ["BEATRIZ JACINTO NUNES"] };
    const desc = (description: string) => suggestScope({ ...base, counterparty: null, description }, ing);
    expect(desc("Transferência de BEATRIZ JACINTO NUNES")).toBe("entre_nos");
    expect(desc("Transferência para BEATRIZ JACINTO NUNES")).toBe("entre_nos");
    expect(desc("Kruidvat")).toBe("pessoal");
  });

  it("o resto é pessoal por defeito", () => {
    expect(suggestScope(byDesc("Kruidvat")[0], bea)).toBe("pessoal");
    expect(suggestScope(byDesc("Payment from EMPRESA")[0], bea)).toBe("pessoal");
  });

  it("sem nomes configurados nada é marcado como transferência", () => {
    const none = { ownNames: [], partnerNames: [] };
    expect(suggestScope(byDesc("transfer to Pessoa Bea")[0], none)).toBe("pessoal");
  });
});

describe("Albert Heijn: pessoal em horário de trabalho, casal fora dele", () => {
  const ah = { ...byDesc("Albert Heijn")[0], descriptionOriginal: "ALBERT HEIJN 2216 ROTTERDAM NLD" };
  const at = (date: string) => suggestScope({ ...ah, date }, bea);

  it.each([
    ["2026-09-14 09:00:00", "pessoal"], // segunda, 9h em ponto
    ["2026-09-18 12:16:07", "pessoal"], // sexta à hora de almoço
    ["2026-09-15 17:59:59", "pessoal"],
    ["2026-09-15 18:00:00", "casal"], // a partir das 18h
    ["2026-09-15 08:59:00", "casal"],
    ["2026-09-19 12:27:57", "casal"], // sábado
    ["2026-09-20 11:00:00", "casal"], // domingo
  ])("%s → %s", (date, scope) => {
    expect(at(date)).toBe(scope);
  });

  it("também apanha o AH to go", () => {
    expect(suggestScope({ ...ah, descriptionOriginal: "BCK*AH to go 5825 Rdam ROTTERDAM", date: "2026-10-20 11:06:00" }, bea)).toBe(
      "pessoal",
    );
  });

  it("reembolsos do Albert Heijn não entram na regra", () => {
    expect(suggestScope({ ...ah, amountCents: 500, date: "2026-09-19 12:00:00" }, bea)).toBe("pessoal");
  });

  it("isWorkingHours", () => {
    expect(isWorkingHours("2026-11-06 10:00:00")).toBe(true); // sexta
    expect(isWorkingHours("2026-11-07 10:00:00")).toBe(false); // sábado
  });
});

describe("categoria sugerida", () => {
  const cat = (s: string) => {
    const r = byDesc(s)[0];
    return suggestCategoryName(r, suggestScope(r, bea));
  };
  it.each([
    ["Albert Heijn", "Supermercado"],
    ["Jumbo", "Supermercado"],
    ["Ikea", "Casa"],
    ["KLM", "Viagens"],
    ["NS Reizigers", "Transportes"],
    ["Kruidvat", "Saúde e beleza"],
    ["UNIQLO", "Roupa e compras"],
    ["Amazon", "Compras online"],
    ["Card orders fee", "Comissões bancárias"],
    ["Payment from TERCEIRO", "Outras receitas"],
    ["transfer to Pessoa Bea", "Transferências"],
  ])("%s → %s", (desc, expected) => {
    expect(cat(desc)).toBe(expected);
  });
  it("débito SEPA sem destinatário fica por categorizar", () => {
    expect(cat("SEPA+ credit transfer")).toBeNull();
  });
});
