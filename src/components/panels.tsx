"use client";

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(1);
}

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return "$" + (n / 1000).toFixed(1) + "k";
  const frac = Math.abs(n % 1) > 0.004;
  return "$" + (frac ? n.toFixed(2) : n.toLocaleString());
}

export function fmtPct(n: number, digits = 1): string {
  return (n * 100).toFixed(digits) + "%";
}

export function fmtDate(ts: number, hour = false): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (!hour) return date;
  return (
    date +
    " " +
    d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })
  );
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return fmtDate(ts);
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-xl border border-line bg-bg " + className
      }
    >
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className={
          "tnum mt-1.5 text-2xl font-semibold tracking-tight " +
          (accent ? "text-accent" : "text-fg")
        }
      >
        {value}
      </div>
      {delta && <div className="tnum mt-0.5 text-[11px] text-muted">{delta}</div>}
    </div>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  if (!rows.length)
    return (
      <p className="py-8 text-center text-sm text-muted">No data for this range</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th
                key={h}
                className={"pb-2 font-medium " + (i === 0 ? "" : "text-right")}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className={
                    "py-2 " +
                    (j === 0 ? "max-w-0 truncate pr-4 text-fg-soft" : "tnum text-right text-fg")
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value)}
      className="rounded-full border border-line px-3 py-1 text-xs text-fg-soft transition hover:border-line-strong hover:text-fg"
    >
      {label}
    </button>
  );
}
