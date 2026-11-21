"use client";

// Gráficos feitos à mão (SVG/HTML), seguindo a mesma linguagem visual da app:
// marcas finas, grelha discreta, uma só escala, legenda + tooltip + vista em tabela.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatEUR } from "@/lib/format";

/* ---------- utilitários ---------- */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** € compacto para eixos: 1.500 € → "1,5 mil €". */
export function eurShort(cents: number) {
  const e = Math.abs(cents) / 100;
  const sign = cents < 0 ? "−" : "";
  if (e >= 1000) return `${sign}${(e / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} mil €`;
  return `${sign}${Math.round(e)} €`;
}

/** Escala "bonita": máximo arredondado e 3–5 marcas. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(v);
  return out;
}

export function SeriesKey({ color, shape = "rect" }: { color: string; shape?: "rect" | "line" }) {
  return shape === "line" ? (
    <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />
  ) : (
    <span className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} />
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "rect" | "line" }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <SeriesKey color={i.color} shape={i.shape} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, title, rows, width }: { x: number; y: number; title: string; rows: { label: string; value: string; color?: string }[]; width: number }) {
  const w = 190;
  const left = Math.min(Math.max(x - w / 2, 0), Math.max(width - w, 0));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left, top: y, width: w }}
    >
      <p className="mb-1 text-ink-3">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.color && <SeriesKey color={r.color} shape="line" />}
          <span className="num font-semibold text-ink">{r.value}</span>
          <span className="truncate text-ink-3">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

/** Vista em tabela por baixo de cada gráfico (acessibilidade e valores exatos). */
export function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-ink-3 hover:text-ink-2">Ver tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-ink-3">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={`py-1 pr-4 font-normal ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className={`py-1 pr-4 ${j > 0 ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ---------- colunas agrupadas por mês ---------- */

export type ColumnSeries = { key: string; label: string; color: string; values: number[] };

export function ColumnChart({
  labels,
  series,
  highlight,
  height = 200,
}: {
  labels: string[];
  series: ColumnSeries[];
  /** índice da coluna a destacar (ex.: mês selecionado); as outras ficam mais suaves */
  highlight?: number;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 56;
  const bottom = 22;
  const padTop = 8;
  const plotW = Math.max(width - axisW, 0);
  const plotH = height - bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const band = labels.length ? plotW / labels.length : 0;
  const gap = 2;
  const barW = Math.min(24, Math.max(4, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v: number) => padTop + (plotH - padTop) * (1 - v / top);

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Gráfico de colunas por mês">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={axisW} x2={width} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={axisW - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-ink-3 text-[11px]">
                {eurShort(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const x0 = axisW + i * band + (band - groupW) / 2;
            const dim = highlight != null && i !== highlight && hover !== i;
            return (
              <g
                key={l + i}
                tabIndex={0}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect x={axisW + i * band} y={0} width={band} height={plotH} fill={hover === i ? "var(--chart-hover)" : "transparent"} />
                {series.map((s, j) => {
                  const v = s.values[i] ?? 0;
                  const h = Math.max(0, plotH - y(v));
                  const x = x0 + j * (barW + gap);
                  const r = Math.min(4, barW / 2, h);
                  return (
                    <path
                      key={s.key}
                      d={`M${x},${plotH} V${plotH - h + r} Q${x},${plotH - h} ${x + r},${plotH - h} H${x + barW - r} Q${x + barW},${plotH - h} ${x + barW},${plotH - h + r} V${plotH} Z`}
                      fill={s.color}
                      opacity={dim ? 0.35 : 1}
                    />
                  );
                })}
                <text x={axisW + i * band + band / 2} y={height - 6} textAnchor="middle" className={`text-[11px] ${i === highlight ? "fill-ink font-medium" : "fill-ink-3"}`}>
                  {l}
                </text>
              </g>
            );
          })}
          <line x1={axisW} x2={width} y1={plotH} y2={plotH} stroke="var(--chart-axis)" strokeWidth={1} />
        </svg>
      )}
      {hover != null && (
        <Tooltip
          x={axisW + hover * band + band / 2}
          y={8}
          width={width}
          title={labels[hover]}
          rows={series.map((s) => ({ label: s.label, value: formatEUR(s.values[hover] ?? 0), color: s.color }))}
        />
      )}
    </div>
  );
}

/* ---------- barras horizontais por categoria ---------- */

export type BarItem = { key: string; label: string; cents: number; prevCents?: number; href?: string };

export function CategoryBars({ items, color = "var(--series-1)", prevLabel = "mês anterior" }: { items: BarItem[]; color?: string; prevLabel?: string }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.cents, i.prevCents ?? 0)));
  const total = items.reduce((s, i) => s + i.cents, 0);
  const hasPrev = items.some((i) => i.prevCents != null);
  return (
    <div>
      {hasPrev && (
        <div className="mb-3">
          <Legend
            items={[
              { label: "este mês", color },
              { label: prevLabel, color: "var(--ink-3)", shape: "line" },
            ]}
          />
        </div>
      )}
      <ul className="space-y-2.5">
        {items.map((i) => {
          const delta = i.prevCents ? (i.cents - i.prevCents) / i.prevCents : null;
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{i.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {delta != null && Math.abs(delta) >= 0.05 && (
                    <span className="num text-xs text-ink-3">
                      {delta > 0 ? "▲" : "▼"} {Math.round(Math.abs(delta) * 100)}%
                    </span>
                  )}
                  <span className="num font-medium">{formatEUR(i.cents)}</span>
                  <span className="num w-9 text-right text-xs text-ink-3">{Math.round((i.cents / Math.max(total, 1)) * 100)}%</span>
                </span>
              </div>
              <div className="relative mt-1 h-2">
                <div className="h-2 rounded-r-[4px]" style={{ width: `${(i.cents / max) * 100}%`, background: color, minWidth: 2 }} />
                {i.prevCents != null && i.prevCents > 0 && (
                  <span
                    className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-ink-3"
                    style={{ left: `calc(${(i.prevCents / max) * 100}% - 1px)` }}
                    title={`${prevLabel}: ${formatEUR(i.prevCents)}`}
                  />
                )}
              </div>
            </>
          );
          return (
            <li key={i.key} title={i.prevCents != null ? `${i.label}: ${formatEUR(i.cents)} (${prevLabel}: ${formatEUR(i.prevCents)})` : undefined}>
              {i.href ? (
                <Link href={i.href} className="block rounded-md transition hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- barra empilhada 100% (partes de um todo) ---------- */

export function StackBar({ parts }: { parts: { key: string; label: string; cents: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.cents, 0);
  const visible = parts.filter((p) => p.cents > 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((p) => `${p.label} ${formatEUR(p.cents)}`).join(", ")}>
        {total === 0 ? (
          <div className="h-full w-full bg-surface-2" />
        ) : (
          visible.map((p) => (
            <div key={p.key} style={{ width: `${(p.cents / total) * 100}%`, background: p.color }} title={`${p.label}: ${formatEUR(p.cents)}`} />
          ))
        )}
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <SeriesKey color={p.color} />
            <span className="text-ink-2">{p.label}</span>
            <span className="num ml-auto font-medium">{formatEUR(p.cents)}</span>
            <span className="num w-10 text-right text-xs text-ink-3">{total ? Math.round((p.cents / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- ritmo do mês: gasto acumulado vs mês anterior ---------- */

export function PaceChart({
  current,
  previous,
  currentLabel,
  previousLabel,
  today,
  height = 200,
}: {
  current: number[];
  previous: number[];
  currentLabel: string;
  previousLabel: string;
  /** último dia com dados no mês atual (para não desenhar o futuro) */
  today: number;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 56;
  const bottom = 22;
  const right = 12;
  const plotW = Math.max(width - axisW - right, 0);
  const plotH = height - bottom - 8;
  const days = Math.max(current.length, previous.length);
  const cur = current.slice(0, today);
  const max = Math.max(1, ...cur, ...previous);
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const x = (d: number) => axisW + (days <= 1 ? 0 : (d / (days - 1)) * plotW);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");

  function onMove(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const d = Math.round(((e.clientX - rect.left - axisW) / Math.max(plotW, 1)) * (days - 1));
    setHover(Math.min(Math.max(d, 0), days - 1));
  }

  const xTicks = [0, 9, 19, days - 1].filter((d, i, a) => d < days && a.indexOf(d) === i);

  return (
    <div ref={ref} className="relative touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Gasto acumulado de ${currentLabel} comparado com ${previousLabel}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={axisW} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={axisW - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-ink-3 text-[11px]">
                {eurShort(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={height - 6} textAnchor="middle" className="num fill-ink-3 text-[11px]">
              {d + 1}
            </text>
          ))}
          <line x1={axisW} x2={width - right} y1={y(0)} y2={y(0)} stroke="var(--chart-axis)" />
          {previous.length > 0 && <path d={path(previous)} fill="none" stroke="var(--chart-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {cur.length > 0 && (
            <>
              <path d={`${path(cur)} L${x(cur.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--series-1)" opacity={0.1} />
              <path d={path(cur)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(cur.length - 1)} cy={y(cur.at(-1)!)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={8} y2={y(0)} stroke="var(--chart-axis)" />
              {hover < cur.length && <circle cx={x(hover)} cy={y(cur[hover])} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
              {hover < previous.length && <circle cx={x(hover)} cy={y(previous[hover])} r={4} fill="var(--chart-muted)" stroke="var(--surface)" strokeWidth={2} />}
            </>
          )}
        </svg>
      )}
      {hover != null && (
        <Tooltip
          x={x(hover)}
          y={0}
          width={width}
          title={`Até ao dia ${hover + 1}`}
          rows={[
            ...(hover < cur.length ? [{ label: currentLabel, value: formatEUR(cur[hover]), color: "var(--series-1)" }] : []),
            ...(hover < previous.length ? [{ label: previousLabel, value: formatEUR(previous[hover]), color: "var(--chart-muted)" }] : []),
          ]}
        />
      )}
    </div>
  );
}

/* ---------- peças de layout ---------- */

export function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, delta, deltaGood }: { label: string; value: string; delta?: string | null; deltaGood?: boolean | null }) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight sm:text-2xl">{value}</p>
      {delta && (
        <p className={`mt-0.5 text-xs ${deltaGood == null ? "text-ink-3" : deltaGood ? "text-pos" : "text-danger"}`}>{delta}</p>
      )}
    </div>
  );
}
