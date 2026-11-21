// Formatação pt-PT feita à mão: o Intl de pt-PT não agrupa milhares com
// ponto ("1234,56 €"), e nós queremos sempre "1.234,56 €".

export function formatEUR(cents: number, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100).toString();
  const rest = (abs % 100).toString().padStart(2, "0");
  const grouped = euros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const prefix = negative ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${prefix}${grouped},${rest} €`;
}

/** "2026-09-04 18:00:28" ou "2026-09-04" → "04/09/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatTime(iso: string): string {
  return iso.length >= 16 ? iso.slice(11, 16) : "";
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "2026-09-04" → "sexta, 4 de setembro de 2026" */
export function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Converte "1.234,56", "-3.67", "1234.5", "−12,00 €" em cêntimos. */
export function parseAmountToCents(raw: string, decimal: "." | ","): number {
  let s = raw.trim().replace(/[€\s ]/g, "").replace("−", "-");
  if (s === "") throw new Error(`Valor vazio`);
  if (decimal === ",") s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`Valor inválido: "${raw}"`);
  // Aritmética inteira a partir do texto: nada de Number("1.005") * 100.
  const [, sign, int, frac = ""] = m;
  let cents = Number(int) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  return sign === "-" ? -cents : cents;
}
