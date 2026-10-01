"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

export type Point = {
  label: string;
  pageviews: number;
  visitors: number;
  revenue: number;
};

function niceMax(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const unit = n / pow;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * pow;
}

export function AreaChart({
  data,
  metric,
  height = 180,
}: {
  data: Point[];
  metric: "visitors" | "pageviews" | "revenue";
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { t: 14, r: 8, b: 22, l: 44 };

  const values = data.map((d) => d[metric]);
  const max = niceMax(Math.max(1, ...values));
  const w = Math.max(width, 100);
  const innerW = Math.max(10, w - pad.l - pad.r);
  const innerH = Math.max(10, height - pad.t - pad.b);

  const x = (i: number) =>
    pad.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[metric]).toFixed(1)}`)
    .join(" ");
  const area =
    data.length > 0
      ? `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`
      : "";

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - pad.l) / innerW;
    const idx = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const labelStep = Math.max(1, Math.ceil(data.length / 6));
  const fmt =
    metric === "revenue"
      ? (v: number) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v))
      : (v: number) => String(v);

  // An empty/zero series must read 0, not the 1 forced by the scale floor, and
  // a mid tick that rounds onto its neighbour is dropped instead of repeating.
  const allZero = values.every((v) => !v);
  const tick = (f: number) => (allZero ? 0 : Math.round(max * (1 - f)));
  const midDup = tick(0.5) === tick(0) || tick(0.5) === tick(1);

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={w}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((f) => {
            const yy = pad.t + innerH * f;
            const val = tick(f);
            return (
              <g key={f}>
                <line
                  x1={pad.l}
                  x2={w - pad.r}
                  y1={yy}
                  y2={yy}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={pad.l - 8}
                  y={yy + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--muted)"
                  className="tnum"
                >
                  {f === 0.5 && midDup ? "" : fmt(val)}
                </text>
              </g>
            );
          })}

          <path d={area} fill={`url(#grad-${metric})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {data.map((d, i) =>
            i % labelStep === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted)"
                className="tnum"
              >
                {shortLabel(d.label)}
              </text>
            ) : null,
          )}

          {hover !== null && data[hover] && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={pad.t + innerH}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(data[hover][metric])}
                r={3.5}
                fill="var(--bg)"
                stroke="var(--accent)"
                strokeWidth={2}
              />
              <g
                transform={`translate(${Math.min(Math.max(x(hover) - 44, pad.l), w - 96)},${pad.t - 4})`}
              >
                <rect
                  width={92}
                  height={38}
                  rx={6}
                  fill="var(--fg)"
                  opacity={0.94}
                />
                <text x={8} y={15} fontSize={10} fill="var(--bg)" opacity={0.7}>
                  {data[hover].label.slice(0, 13)}
                </text>
                <text x={8} y={30} fontSize={12} fill="var(--bg)" className="tnum">
                  {fmt(data[hover][metric])}{" "}
                  {metric === "revenue" ? "" : metric}
                </text>
              </g>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

function shortLabel(label: string): string {
  if (label.includes(" ")) return label.slice(11, 16) || label;
  const [, m, d] = label.split("-");
  return m && d ? `${m}/${d}` : label;
}

export function BarList({
  rows,
  format = (v: number) => String(v),
  accent = false,
}: {
  rows: { label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  accent?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted">No data yet</p>;
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div
          key={r.label + i}
          className="group relative isolate flex items-center justify-between gap-4 overflow-hidden rounded-md px-2.5 py-1.5 text-sm"
        >
          <span
            className="absolute inset-y-0 left-0 -z-10 rounded-md transition-[width] duration-500"
            style={{
              width: `${Math.max(4, (r.value / max) * 100)}%`,
              background: accent ? "var(--accent-soft)" : "var(--panel)",
            }}
          />
          <span className="min-w-0 truncate text-fg-soft group-hover:text-fg">
            {r.label}
            {r.sub && (
              <span className="ml-2 text-xs text-muted">{r.sub}</span>
            )}
          </span>
          <span className="tnum shrink-0 text-fg">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, b) => a + b.value, 0);
  const colors = [
    "var(--accent)",
    "var(--fg)",
    "var(--line-strong)",
    "var(--muted)",
    "var(--accent-soft)",
  ];
  let acc = 0;
  const R = 42;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-5">
      <svg width={110} height={110} className="shrink-0 -rotate-90">
        <circle
          cx={55}
          cy={55}
          r={R}
          fill="none"
          stroke="var(--panel)"
          strokeWidth={13}
        />
        {total > 0 &&
          rows.slice(0, 5).map((r, i) => {
            const frac = r.value / total;
            const dash = `${frac * C} ${C}`;
            const offset = -acc * C;
            acc += frac;
            return (
              <circle
                key={r.label}
                cx={55}
                cy={55}
                r={R}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth={13}
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            );
          })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {rows.slice(0, 5).map((r, i) => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: colors[i % colors.length] }}
              />
              <span className="truncate text-fg-soft">{r.label}</span>
            </span>
            <span className="tnum text-muted">
              {total ? Math.round((r.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function usePulse(intervalMs: number, active = true) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => force((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, active]);
}
