"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SiteRow = {
  id: string;
  name: string;
  domain: string;
  role: string;
  pageviews: number;
  visitors: number;
  revenue: number;
};

export function SitesView({ sites }: { sites: SiteRow[] }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Websites</h1>
          <p className="mt-1 text-sm text-muted">
            {sites.length === 0
              ? "Add your first site to start tracking."
              : `${sites.length} site${sites.length > 1 ? "s" : ""} · last 30 days`}
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          Add website
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-line p-12 text-center">
          <p className="text-sm text-muted">
            Nothing here yet. Add a domain and paste one line of script.
          </p>
          <button
            onClick={() => setAdding(true)}
            className="mt-5 rounded-full border border-line px-5 py-2 text-sm text-fg transition hover:border-line-strong"
          >
            Add your first website
          </button>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {sites.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/${s.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-panel"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {s.role}
                  </span>
                </div>
                <div className="truncate text-xs text-muted">{s.domain}</div>
              </div>
              <div className="tnum flex shrink-0 items-center gap-6 text-right text-sm">
                <Metric label="Visitors" value={format(s.visitors)} />
                <Metric label="Pageviews" value={format(s.pageviews)} />
                <Metric
                  label="Revenue"
                  value={"$" + format(Math.round(s.revenue))}
                  accent
                />
              </div>
            </Link>
          ))}
        </div>
      )}

      {adding && <AddSiteModal onClose={() => setAdding(false)} onCreated={(id) => router.push(`/dashboard/${id}`)} />}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="hidden w-20 sm:block">
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={"tnum text-sm " + (accent ? "text-accent" : "text-fg")}>
        {value}
      </div>
    </div>
  );
}

function format(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}

export function AddSiteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(true);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      if (demo) {
        await fetch(`/api/sites/${data.site.id}/demo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 60 }),
        });
      }
      onCreated(data.site.id);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
      <div className="w-full max-w-md rounded-xl border border-line bg-bg p-6 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold">Add website</h2>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll generate your tracking snippet.
        </p>
        <form onSubmit={create} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-fg-soft">
              Name
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My side project"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-fg-soft">
              Domain
            </span>
            <input
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-fg-soft">
            <input
              type="checkbox"
              checked={demo}
              onChange={(e) => setDemo(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Seed with 60 days of sample data
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm text-fg-soft hover:border-line-strong"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
