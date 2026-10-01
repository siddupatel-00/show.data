"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtNum, fmtPct, Panel, StatCard, Table } from "./panels";

type SeoRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type SeoData = {
  configured: boolean;
  connected: boolean;
  property?: string | null;
  candidates?: string[];
  note?: string;
  error?: string;
  queries?: SeoRow[];
  pages?: SeoRow[];
  countries?: SeoRow[];
};

export function SiteSeo({
  siteId,
  range,
  role,
}: {
  siteId: string;
  range: { from: number; to: number };
  role: string;
}) {
  const [data, setData] = useState<SeoData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/seo?from=${range.from}&to=${range.to}`,
      );
      if (res.ok) {
        setData(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        setData({
          configured: true,
          connected: false,
          error: d.error || "Request failed",
        });
      }
    } catch {
      setData({ configured: true, connected: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [siteId, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data)
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;

  if (!data) return null;

  if (!data.configured) {
    return (
      <Panel title="Google Search Console">
        <p className="text-sm text-fg-soft">
          This deployment has no Google OAuth credentials yet. Set{" "}
          <code className="rounded bg-panel px-1 py-0.5 text-xs">
            GOOGLE_CLIENT_ID
          </code>{" "}
          and{" "}
          <code className="rounded bg-panel px-1 py-0.5 text-xs">
            GOOGLE_CLIENT_SECRET
          </code>{" "}
          and register{" "}
          <code className="rounded bg-panel px-1 py-0.5 text-xs">
            /api/integrations/google/callback
          </code>{" "}
          as an authorized redirect URI, then redeploy.
        </p>
      </Panel>
    );
  }

  if (!data.connected) {
    return (
      <Panel title="Google Search Console">
        <p className="max-w-2xl text-sm text-fg-soft">
          Connect Search Console to see the queries, pages and countries that
          bring you organic clicks — next to the traffic and revenue they earn
          in SidFast.
        </p>
        {data.error && <p className="mt-3 text-sm text-danger">{data.error}</p>}
        {role !== "viewer" && (
          <a
            href={`/api/integrations/google/start?site=${siteId}`}
            className="mt-5 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
          >
            Connect Google Search Console
          </a>
        )}
        <p className="mt-4 text-xs text-muted">
          Your domain must be verified in Search Console. SidFast only requests
          read-only access.
        </p>
      </Panel>
    );
  }

  const rows = (list: SeoRow[] | undefined) =>
    (list || []).map((r) => [
      r.keys[0],
      fmtNum(r.clicks),
      fmtNum(r.impressions),
      fmtPct(r.ctr),
      r.position.toFixed(1),
    ]);

  const total = (list: SeoRow[] | undefined, key: "clicks" | "impressions") =>
    (list || []).reduce((sum, r) => sum + (r[key] || 0), 0);

  const impressions = total(data.queries, "impressions");
  const clicks = total(data.queries, "clicks");
  const avgCtr = impressions ? clicks / impressions : 0;
  const avgPos = impressions
    ? (data.queries || []).reduce((s, r) => s + r.position * r.impressions, 0) /
      impressions
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clicks" value={fmtNum(clicks)} accent />
        <StatCard label="Impressions" value={fmtNum(impressions)} />
        <StatCard label="Average CTR" value={fmtPct(avgCtr)} />
        <StatCard label="Average position" value={avgPos.toFixed(1)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top queries"
          action={
            <span className="text-xs text-muted">{data.property}</span>
          }
        >
          <Table
            head={["Query", "Clicks", "Impr.", "CTR", "Pos."]}
            rows={rows(data.queries)}
          />
        </Panel>
        <Panel title="Top pages">
          <Table
            head={["Page", "Clicks", "Impr.", "CTR", "Pos."]}
            rows={rows(data.pages)}
          />
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {data.note || "Google Search Console data lags by up to 3 days."}
        </p>
        {role !== "viewer" && (
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/sites/${siteId}/seo`, { method: "DELETE" });
              load();
            }}
            className="rounded-full border border-line px-3 py-1.5 text-xs text-fg-soft transition hover:border-line-strong hover:text-fg"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
