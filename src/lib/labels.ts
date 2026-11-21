export const SCOPES = ["pessoal", "casal", "interna", "entre_nos", "ignorar"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  pessoal: "Pessoal",
  casal: "Partilhado",
  interna: "Transf. interna",
  entre_nos: "Entre nós",
  ignorar: "Ignorar",
};

export const SCOPE_HINT: Record<Scope, string> = {
  pessoal: "Só tu vês",
  casal: "Despesa da casa, dividida entre os dois",
  interna: "Entre contas tuas — não conta como despesa",
  entre_nos: "Dinheiro entre vocês — não conta como despesa",
  ignorar: "Fica guardada mas não entra em nenhum cálculo",
};

/** Âmbitos que contam como despesa/receita real. */
export const COUNTED_SCOPES: Scope[] = ["pessoal", "casal"];

export const KINDS = ["fixa", "variavel", "pontual"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  fixa: "Fixa",
  variavel: "Variável",
  pontual: "Pontual",
};

export const BANKS = ["ing", "revolut", "caixa", "dinheiro"] as const;
export type Bank = (typeof BANKS)[number];

export const BANK_LABEL: Record<Bank, string> = {
  ing: "ING",
  revolut: "Revolut",
  caixa: "Caixa",
  dinheiro: "Dinheiro",
};

export const INVESTMENT_TYPES = ["acoes", "etf", "ppr", "cripto", "deposito", "outro"] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];
export const INVESTMENT_LABEL: Record<InvestmentType, string> = {
  acoes: "Ações",
  etf: "ETF / Fundos",
  ppr: "PPR",
  cripto: "Cripto",
  deposito: "Depósito a prazo",
  outro: "Outro",
};
