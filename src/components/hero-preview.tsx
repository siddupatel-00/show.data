import { AreaChart, BarList } from "./charts";

function seeded(n: number) {
  let x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

const points = Array.from({ length: 30 }, (_, i) => {
  const wave = Math.sin(i / 3.4) * 0.35 + Math.sin(i / 8) * 0.25;
  const growth = 0.35 + (i / 30) * 0.9;
  const visitors = Math.round(60 * growth * (1 + wave) + seeded(i) * 25);
  return {
    label: `2026-09-${String(i + 1).padStart(2, "0")}`,
    visitors,
    pageviews: Math.round(visitors * 2.4),
    revenue: Math.round(visitors * (2 + seeded(i + 99) * 4)),
  };
});

const SOURCES = [
  { label: "Google", value: 421 },
  { label: "X (Twitter)", value: 318 },
  { label: "Direct", value: 244 },
  { label: "Hacker News", value: 137 },
  { label: "GitHub", value: 92 },
];

export function HeroPreview() {
  return (
    <div className="grid gap-0 md:grid-cols-[1fr_240px]">
      <div className="border-line p-5 md:border-r">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Visitors", "8,412", "+18%"],
            ["Revenue", "$12,940", "+31%"],
            ["Conv. rate", "3.4%", "+0.6"],
            ["RPV", "$1.54", "+$0.21"],
          ].map(([k, v, d]) => (
            <div key={k} className="rounded-lg border border-line bg-bg p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">
                {k}
              </div>
              <div className="tnum mt-1 text-lg font-semibold">{v}</div>
              <div className="tnum text-[11px] text-accent">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-line bg-bg p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
            <span>Visitors · last 30 days</span>
            <span className="text-accent">live</span>
          </div>
          <AreaChart data={points} metric="visitors" height={150} />
        </div>
      </div>
      <div className="p-5">
        <div className="mb-3 text-[11px] uppercase tracking-wide text-muted">
          Top sources
        </div>
        <BarList rows={SOURCES} accent />
      </div>
    </div>
  );
}
