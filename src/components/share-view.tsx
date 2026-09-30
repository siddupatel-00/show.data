"use client";

import { useEffect, useState } from "react";
import { AreaChart, BarList, Donut, type Point } from "./charts";
import { fmtMoney, fmtNum, fmtPct, Panel, StatCard } from "./panels";

type Data = {
  site: { name: string; domain: string };
  range: { from: number; to: number };
  overview: {
    pageviews: number;
    visitors: number;
    revenue: number;
    conversionRate: number;
    bounceRate: number;
  };
  series: Point[];
  pages: { label: string; visitors: number }[];
  referrers: { label: string; visitors: number }[];
  countries: { label: string; visitors: number }[];
  devices: { label: string; visitors: number }[];
  sources: { label: string; visitors: number; revenue: number }[];
};

const PRESETS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

export function ShareView({
  shareId,
  domain,
}: {
  shareId: string;
  domain: string;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [metric, setMetric] = useState<"visitors" | "pageviews" | "revenue">(
    "visitors",
  );

  useEffect(() => {
    const to = Date.now() + 60_000;
    const from = to - days * 86400_000;
    fetch(`/api/share/${shareId}?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [shareId, days]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {data?.site.name ?? "Loading…"}
          </h1>
          <p className="text-xs text-muted">{domain}</p>
        </div>
        <div className="flex rounded-full border border-line p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDays(p.days)}
              className={
                "rounded-full px-3 py-1 text-xs transition " +
                (days === p.days
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <p className="py-24 text-center text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Visitors" value={fmtNum(data.overview.visitors)} />
            <StatCard label="Pageviews" value={fmtNum(data.overview.pageviews)} />
            <StatCard label="Revenue" value={fmtMoney(data.overview.revenue)} accent />
            <StatCard
              label="Conversion"
              value={fmtPct(data.overview.conversionRate)}
            />
          </div>

          <Panel
            title="Trend"
            action={
              <div className="flex rounded-full border border-line p-0.5">
                {(["visitors", "pageviews", "revenue"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={
                      "rounded-full px-2.5 py-0.5 text-[11px] capitalize " +
                      (metric === m
                        ? "bg-accent text-accent-fg"
                        : "text-muted hover:text-fg")
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
            }
          >
            <AreaChart data={data.series} metric={metric} height={200} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top pages">
              <BarList rows={data.pages.map((p) => ({ label: p.label, value: p.visitors }))} />
            </Panel>
            <Panel title="Referrers">
              <BarList rows={data.referrers.map((p) => ({ label: p.label, value: p.visitors }))} />
            </Panel>
            <Panel title="Countries">
              <BarList rows={data.countries.map((p) => ({ label: p.label, value: p.visitors }))} />
            </Panel>
            <Panel title="Devices">
              <Donut rows={data.devices.map((d) => ({ label: d.label, value: d.visitors }))} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
