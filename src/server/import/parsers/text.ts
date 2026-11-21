export function firstLine(text: string) {
  return text.replace(/^﻿/, "").split(/\r?\n/, 1)[0].trim();
}

export function titleCaseIfShouting(s: string) {
  if (s.length < 4 || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

/** "My Way via Stichting Mollie Payments" → "My Way" */
export function withoutVia(s: string) {
  return s.replace(/\s+via\s+.+$/i, "").trim();
}
