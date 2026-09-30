"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, BarList, Donut, type Point } from "./charts";
import {
  CopyButton,
  fmtDate,
  fmtMoney,
  fmtNum,
  fmtPct,
  Panel,
  StatCard,
  Table,
  timeAgo,
} from "./panels";
import { SiteSettings, type Member } from "./site-settings";
import { SiteSeo } from "./site-seo";
import { useSearchParams } from "next/navigation";

export type SiteInfo = {
  id: string;
  name: string;
  domain: string;
  token: string;
  shareId: string;
  role: "owner" | "editor" | "viewer";
  origin: string;
  goals: { id: string; name: string; created_at: number }[];
  funnels: { id: string; name: string; steps: string }[];
  members: Member[];
  plan: "free" | "pro";
};

type Row = { label: string; pageviews: number; visitors: number; revenue: number };

type Stats = {
  range: { from: number; to: number };
  granularity: "hour" | "day";
  overview: {
    pageviews: number;
    visitors: number;
    visits: number;
    bounceRate: number;
    viewsPerVisit: number;
    revenue: number;
    payments: number;
    conversionRate: number;
    revenuePerVisitor: number;
    avgOrderValue: number;
    goals: number;
  };
  series: Point[];
  pages: Row[];
  referrers: Row[];
  sources: Row[];
  utmMedium: Row[];
  utmCampaign: Row[];
  funnels: {
    id: string;
    name: string;
    steps: { name: string; kind: string; value: string }[];
    results: { name: string; visitors: number; rate: number }[];
  }[];
  countries: Row[];
  cities: Row[];
  browsers: Row[];
  platforms: Row[];
  devices: Row[];
  entry: { label: string; visitors: number }[];
  exit: { label: string; visitors: number }[];
  goals: {
    totalVisitors: number;
    goals: {
      label: string;
      conversions: number;
      visitors: number;
      revenue: number;
      rate: number;
    }[];
  };
  payments: {
    created_at: number;
    amount: number;
    currency: string;
    customer_email: string;
    goal_name: string;
    first_source: string;
    last_source: string;
    path: string;
    country: string;
  }[];
  revenue: {
    bySource: { label: string; revenue: number; payments: number; visitors: number }[];
    byReferrer: { label: string; revenue: number; payments: number }[];
  };
  revenueLast: {
    bySource: { label: string; revenue: number; payments: number; visitors: number }[];
    byReferrer: { label: string; revenue: number; payments: number }[];
  };
};

type Realtime = {
  pageviews: number;
  visitors: number;
  pages: { label: string; pageviews: number; last_seen: number }[];
  sources: { label: string; pageviews: number; last_seen: number }[];
  recent: {
    type: string;
    path: string;
    referrer_source: string;
    country: string;
    device: string;
    browser: string;
    amount: number;
    created_at: number;
  }[];
};

const TABS = [
  "overview",
  "live",
  "goals",
  "revenue",
  "utm",
  "seo",
  "settings",
] as const;
type Tab = (typeof TABS)[number];

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

function rangeFromPreset(days: number) {
  const now = Date.now();
  if (days === 0) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return { from: d.getTime(), to: now + 60_000 };
  }
  return { from: now - days * 86400_000, to: now + 60_000 };
}

export function SiteDashboard({ site }: { site: SiteInfo }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab && (TABS as readonly string[]).includes(initialTab)
      ? (initialTab as Tab)
      : "overview",
  );
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState(() => rangeFromPreset(30));
  const [data, setData] = useState<Stats | null>(null);
  const [live, setLive] = useState<Realtime | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"visitors" | "pageviews" | "revenue">(
    "visitors",
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sites/${site.id}/stats?from=${range.from}&to=${range.to}`,
      );
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [site.id, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "live") return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/sites/${site.id}/stats?view=realtime`);
      if (res.ok && alive) setLive(await res.json());
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tab, site.id]);

  const applyPreset = (key: string, days: number) => {
    setPreset(key);
    setCustomFrom("");
    setCustomTo("");
    setRange(rangeFromPreset(days));
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    const from = new Date(customFrom + "T00:00:00Z").getTime();
    const to = new Date(customTo + "T23:59:59Z").getTime();
    if (to > from) {
      setPreset("custom");
      setRange({ from, to });
    }
  };

  const snippet = useMemo(
    () =>
      `<script defer src="${site.origin}/t.js?site=${site.token}"></script>`,
    [site.origin, site.token],
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{site.name}</h1>
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {site.role}
            </span>
          </div>
          <p className="text-xs text-muted">{site.domain}</p>
        </div>
        <RangePicker
          preset={preset}
          onPreset={applyPreset}
          customFrom={customFrom}
          customTo={customTo}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
          onCustom={applyCustom}
        />
      </div>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "relative whitespace-nowrap px-3 py-2 text-sm capitalize transition " +
              (tab === t
                ? "text-fg"
                : "text-muted hover:text-fg-soft")
            }
          >
            {t === "live" ? "Live" : t}
            {tab === t && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6" aria-busy={loading}>
        {tab === "overview" && data && <Overview data={data} metric={metric} setMetric={setMetric} />}
        {tab === "live" && <Live live={live} />}
        {tab === "goals" && data && <Goals site={site} data={data} onChange={load} />}
        {tab === "revenue" && data && <Revenue site={site} data={data} />}
        {tab === "utm" && data && <Utm data={data} />}
        {tab === "seo" && (
          <SiteSeo siteId={site.id} range={range} role={site.role} />
        )}
        {tab === "settings" && (
          <SiteSettings site={site} snippet={snippet} onSaved={() => router.refresh()} />
        )}
        {loading && !data && tab !== "live" && (
          <p className="py-20 text-center text-sm text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}

function RangePicker({
  preset,
  onPreset,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  onCustom,
}: {
  preset: string;
  onPreset: (key: string, days: number) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  onCustom: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-full border border-line p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key, p.days)}
            className={
              "rounded-full px-3 py-1 text-xs transition " +
              (preset === p.key
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-fg")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          "rounded-full border px-3 py-1 text-xs transition " +
          (preset === "custom"
            ? "border-accent text-accent"
            : "border-line text-muted hover:text-fg")
        }
      >
        Custom
      </button>
      {open && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-bg p-2 shadow-[var(--shadow)]">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-line bg-bg px-2 py-1 text-xs"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-line bg-bg px-2 py-1 text-xs"
          />
          <button
            onClick={() => {
              onCustom();
              setOpen(false);
            }}
            className="rounded-full bg-accent px-3 py-1 text-xs text-accent-fg"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  data,
  metric,
  setMetric,
}: {
  data: Stats;
  metric: "visitors" | "pageviews" | "revenue";
  setMetric: (m: "visitors" | "pageviews" | "revenue") => void;
}) {
  const o = data.overview;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visitors" value={fmtNum(o.visitors)} />
        <StatCard label="Pageviews" value={fmtNum(o.pageviews)} />
        <StatCard label="Revenue" value={fmtMoney(o.revenue)} accent />
        <StatCard
          label="Conversion"
          value={fmtPct(o.conversionRate)}
          delta={`${o.goals} goal visitors`}
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
                  "rounded-full px-2.5 py-0.5 text-[11px] capitalize transition " +
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
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs text-muted sm:grid-cols-4">
          <span>
            Bounce rate <b className="tnum ml-1 text-fg">{fmtPct(o.bounceRate)}</b>
          </span>
          <span>
            Views / visit{" "}
            <b className="tnum ml-1 text-fg">{o.viewsPerVisit.toFixed(2)}</b>
          </span>
          <span>
            Visits <b className="tnum ml-1 text-fg">{fmtNum(o.visits)}</b>
          </span>
          <span>
            Revenue / visitor{" "}
            <b className="tnum ml-1 text-fg">{fmtMoney(o.revenuePerVisitor)}</b>
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top pages">
          <BarList
            rows={data.pages.map((p) => ({
              label: p.label,
              value: p.visitors,
            }))}
          />
        </Panel>
        <Panel title="Referrers">
          <BarList
            rows={data.referrers.map((p) => ({
              label: p.label,
              value: p.visitors,
            }))}
          />
        </Panel>
        <Panel title="Countries">
          <BarList
            rows={data.countries.map((p) => ({
              label: p.label,
              value: p.visitors,
            }))}
          />
        </Panel>
        <Panel title="Devices">
          <Donut
            rows={data.devices.map((d) => ({ label: d.label, value: d.visitors }))}
          />
          <div className="mt-4 border-t border-line pt-3">
            <BarList
              rows={data.browsers.map((b) => ({
                label: b.label,
                value: b.visitors,
              }))}
            />
          </div>
        </Panel>
        <Panel title="Entry pages">
          <Table
            head={["Page", "Visitors"]}
            rows={data.entry.map((e) => [e.label, fmtNum(e.visitors)])}
          />
        </Panel>
        <Panel title="Exit pages">
          <Table
            head={["Page", "Visitors"]}
            rows={data.exit.map((e) => [e.label, fmtNum(e.visitors)])}
          />
        </Panel>
      </div>
    </div>
  );
}

function Live({ live }: { live: Realtime | null }) {
  if (!live)
    return <p className="py-20 text-center text-sm text-muted">Connecting…</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3">
        <StatCard label="Visitors · 5 min" value={fmtNum(live.visitors)} />
        <StatCard label="Pageviews · 5 min" value={fmtNum(live.pageviews)} accent />
      </div>
      <Panel title="Active pages" className="lg:col-span-1">
        <BarList
          rows={live.pages.map((p) => ({
            label: p.label,
            value: p.pageviews,
            sub: timeAgo(p.last_seen),
          }))}
        />
      </Panel>
      <Panel title="Live sources">
        <BarList
          rows={live.sources.map((p) => ({
            label: p.label,
            value: p.pageviews,
          }))}
        />
      </Panel>
      <Panel title="Activity">
        {live.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No activity in the last 5 minutes
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {live.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-fg-soft">
                  <span
                    className={
                      "mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase " +
                      (r.type === "payment"
                        ? "bg-accent text-accent-fg"
                        : "bg-panel text-muted")
                    }
                  >
                    {r.type}
                  </span>
                  {r.path}
                  {r.country && (
                    <span className="ml-2 text-xs text-muted">{r.country}</span>
                  )}
                </span>
                <span className="tnum shrink-0 text-xs text-muted">
                  {r.amount ? fmtMoney(r.amount) : timeAgo(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Goals({
  site,
  data,
  onChange,
}: {
  site: SiteInfo;
  data: Stats;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([
    { name: "Landing", kind: "path", value: "/" },
    { name: "Signup", kind: "goal", value: "signup" },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFunnel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sites/${site.id}/funnels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steps }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Failed");
        return;
      }
      setShowForm(false);
      setName("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function removeFunnel(id: string) {
    await fetch(`/api/sites/${site.id}/funnels`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visitors" value={fmtNum(data.goals.totalVisitors)} />
        <StatCard label="Goals" value={fmtNum(data.goals.goals.length)} />
        <StatCard
          label="Conversions"
          value={fmtNum(
            data.goals.goals.reduce((a, g) => a + g.conversions, 0),
          )}
          accent
        />
        <StatCard
          label="Goal revenue"
          value={fmtMoney(
            data.goals.goals.reduce((a, g) => a + g.revenue, 0),
          )}
        />
      </div>

      <Panel
        title="Goals"
        action={
          site.role !== "viewer" && (
            <button
              onClick={async () => {
                const n = prompt("Goal name (e.g. signup)");
                if (!n) return;
                await fetch(`/api/sites/${site.id}/goals`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: n }),
                });
                onChange();
              }}
              className="rounded-full border border-line px-3 py-1 text-xs text-fg-soft hover:border-line-strong"
            >
              Add goal
            </button>
          )
        }
      >
        <Table
          head={["Goal", "Conversions", "Visitors", "Rate", "Revenue"]}
          rows={data.goals.goals.map((g) => [
            g.label,
            fmtNum(g.conversions),
            fmtNum(g.visitors),
            fmtPct(g.rate),
            fmtMoney(g.revenue),
          ])}
        />
      </Panel>

      <Panel
        title="Funnels"
        action={
          site.role !== "viewer" && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-full border border-line px-3 py-1 text-xs text-fg-soft hover:border-line-strong"
            >
              {showForm ? "Close" : "New funnel"}
            </button>
          )
        }
      >
        {showForm && (
          <form
            onSubmit={createFunnel}
            className="mb-5 space-y-3 border-b border-line pb-5"
          >
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Funnel name"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            {steps.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((p, j) =>
                        j === i ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder="Step name"
                  className="w-40 rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <select
                  value={s.kind}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((p, j) =>
                        j === i
                          ? { ...p, kind: e.target.value as "path" | "goal" }
                          : p,
                      ),
                    )
                  }
                  className="rounded-lg border border-line bg-bg px-2 py-2 text-sm"
                >
                  <option value="path">path contains</option>
                  <option value="goal">goal is</option>
                </select>
                <input
                  value={s.value}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((p, j) =>
                        j === i ? { ...p, value: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder="/pricing or signup"
                  className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setSteps((p) => [
                    ...p,
                    { name: "Step " + (p.length + 1), kind: "path", value: "" },
                  ])
                }
                className="text-xs text-accent"
              >
                + Add step
              </button>
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                type="submit"
                disabled={busy}
                className="ml-auto rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60"
              >
                {busy ? "Saving…" : "Create funnel"}
              </button>
            </div>
          </form>
        )}

        {data.funnels.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No funnels yet — create one to see drop-off.
          </p>
        ) : (
          <div className="space-y-6">
            {data.funnels.map((f) => (
              <div key={f.id}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium">{f.name}</h4>
                  {site.role !== "viewer" && (
                    <button
                      onClick={() => removeFunnel(f.id)}
                      className="text-xs text-muted hover:text-red-500"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {f.results.map((r) => (
                    <div key={r.name} className="relative isolate overflow-hidden rounded-md border border-line">
                      <span
                        className="absolute inset-y-0 left-0 -z-10 bg-accent-soft"
                        style={{ width: `${Math.max(2, r.rate * 100)}%` }}
                      />
                      <div className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="truncate">{r.name}</span>
                        <span className="tnum text-fg-soft">
                          {fmtNum(r.visitors)}{" "}
                          <span className="text-muted">({fmtPct(r.rate, 0)})</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Revenue({ site, data }: { site: SiteInfo; data: Stats }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  async function testPayment() {
    setSending(true);
    setMsg("");
    try {
      const res = await fetch(`/api/sites/${site.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: site.token,
          amount: 19,
          currency: "USD",
          email: "test@example.com",
          goal: "purchase",
        }),
      });
      setMsg(res.ok ? "Payment sent" : "Failed");
    } finally {
      setSending(false);
    }
  }

  const o = data.overview;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={fmtMoney(o.revenue)} accent />
        <StatCard label="Payments" value={fmtNum(o.payments)} />
        <StatCard label="Avg. order" value={fmtMoney(o.avgOrderValue)} />
        <StatCard label="Revenue / visitor" value={fmtMoney(o.revenuePerVisitor)} />
      </div>

      <Panel title="Revenue trend">
        <AreaChart data={data.series} metric="revenue" height={200} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue by source (first touch)">
          <Table
            head={["Source", "Payments", "Revenue"]}
            rows={data.revenue.bySource.map((r) => [
              r.label,
              fmtNum(r.payments),
              fmtMoney(r.revenue),
            ])}
          />
        </Panel>
        <Panel title="Revenue by referrer">
          <Table
            head={["Referrer", "Payments", "Revenue"]}
            rows={data.revenue.byReferrer.map((r) => [
              r.label,
              fmtNum(r.payments),
              fmtMoney(r.revenue),
            ])}
          />
        </Panel>
      </div>

      <Panel
        title="Payments"
        action={
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-accent">{msg}</span>}
            <button
              onClick={testPayment}
              disabled={sending}
              className="rounded-full border border-line px-3 py-1 text-xs text-fg-soft hover:border-line-strong disabled:opacity-60"
            >
              Send test payment
            </button>
          </div>
        }
      >
        <Table
          head={["Date", "Email", "Amount", "First touch", "Last touch"]}
          rows={data.payments.map((p) => [
            fmtDate(p.created_at, true),
            p.customer_email || "—",
            fmtMoney(p.amount),
            p.first_source || "Direct",
            p.last_source || "Direct",
          ])}
        />
      </Panel>
    </div>
  );
}

function Utm({ data }: { data: Stats }) {
  const map = (rows: Row[]) =>
    rows.map((r) => ({ label: r.label, value: r.visitors, sub: fmtMoney(r.revenue) }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Campaign source">
        <BarList rows={map(data.sources)} accent />
      </Panel>
      <Panel title="Campaign medium">
        <BarList rows={map(data.utmMedium)} />
      </Panel>
      <Panel title="Campaign name">
        <BarList rows={map(data.utmCampaign)} />
      </Panel>
      <Panel title="Full breakdown">
        <Table
          head={["Source", "Visitors", "Revenue"]}
          rows={data.sources.map((s) => [
            s.label,
            fmtNum(s.visitors),
            fmtMoney(s.revenue),
          ])}
        />
      </Panel>
    </div>
  );
}
