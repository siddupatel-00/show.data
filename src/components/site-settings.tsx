"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton, Panel } from "./panels";
import type { SiteInfo } from "./site-dashboard";

export type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export function SiteSettings({
  site,
  snippet,
  onSaved,
}: {
  site: SiteInfo;
  snippet: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [domain, setDomain] = useState(site.domain);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const isViewer = site.role === "viewer";

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const d = await res.json();
      if (!res.ok) return setErr(d.error || "Failed");
      setMsg("Saved");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const res = await fetch(`/api/sites/${site.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error || "Failed");
    setMsg("Invited");
    setInviteEmail("");
    onSaved();
  }

  async function removeMember(userId: string) {
    await fetch(`/api/sites/${site.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    onSaved();
  }

  async function reseed(clear: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/sites/${site.id}/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { clear: true } : { days: 60 }),
      });
      onSaved();
      setMsg(clear ? "Demo data cleared" : "Sample data added");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${site.name} and all of its data?`)) return;
    await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  }

  const shareUrl = `${site.origin}/share/${site.shareId}`;
  const paymentUrl = `${site.origin}/api/sites/${site.id}/payments`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Tracking snippet" className="lg:col-span-2">
        <p className="mb-3 text-sm text-muted">
          Paste this before <code className="text-fg">&lt;/head&gt;</code> on{" "}
          {site.domain}.
        </p>
        <div className="flex items-start gap-3 rounded-lg border border-line bg-panel p-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-xs text-fg-soft">
            {snippet}
          </code>
          <CopyButton value={snippet} label="Copy" />
        </div>
        <p className="mt-3 text-xs text-muted">
          Goals:{" "}
          <code className="text-fg">sidfast(&quot;goal&quot;, &quot;signup&quot;)</code>{" "}
          · Revenue:{" "}
          <code className="text-fg">
            sidfast(&quot;payment&quot;, {"{ amount: 19 }"})
          </code>
        </p>
      </Panel>

      <Panel title="Website details">
        <form onSubmit={saveDetails} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Name</span>
            <input
              value={name}
              disabled={isViewer}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted">Domain</span>
            <input
              value={domain}
              disabled={isViewer}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm disabled:opacity-60"
            />
          </label>
          {!isViewer && (
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </form>
      </Panel>

      <Panel title="Share dashboard">
        <p className="mb-3 text-sm text-muted">
          Anyone with this link can view analytics read-only.
        </p>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
          <code className="min-w-0 flex-1 truncate text-xs text-fg-soft">
            {shareUrl}
          </code>
          <CopyButton value={shareUrl} />
        </div>
        <p className="mt-3 text-xs text-muted">Server-side payments endpoint</p>
        <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
          <code className="min-w-0 flex-1 truncate text-xs text-fg-soft">
            {paymentUrl}
          </code>
          <CopyButton value={paymentUrl} />
        </div>
      </Panel>

      <Panel title="Team">
        <ul className="mb-4 divide-y divide-line">
          {site.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span className="min-w-0 truncate">
                {m.email}
                <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase text-muted">
                  {m.role}
                </span>
              </span>
              {m.role !== "owner" && site.role === "owner" && (
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-xs text-muted hover:text-red-500"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {site.members.length === 0 && (
            <li className="py-2 text-sm text-muted">Just you.</li>
          )}
        </ul>
        {site.role === "owner" && (
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-line bg-bg px-2 py-2 text-sm"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
            </select>
            <button
              type="submit"
              className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-fg"
            >
              Invite
            </button>
          </form>
        )}
        <p className="mt-3 text-xs text-muted">
          They need an account first — send them the signup link.
        </p>
      </Panel>

      <Panel title="Sample data">
        <p className="mb-3 text-sm text-muted">
          Generate 60 days of realistic traffic, goals and payments to explore
          the dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => reseed(false)}
            disabled={busy || isViewer}
            className="rounded-full border border-line px-4 py-1.5 text-xs text-fg-soft hover:border-line-strong disabled:opacity-60"
          >
            Add sample data
          </button>
          <button
            onClick={() => reseed(true)}
            disabled={busy || isViewer}
            className="rounded-full border border-line px-4 py-1.5 text-xs text-muted hover:border-line-strong hover:text-red-500 disabled:opacity-60"
          >
            Clear all events
          </button>
        </div>
      </Panel>

      <Panel title="Danger zone" className="lg:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Deleting removes every event, goal and member for this website.
          </p>
          {site.role === "owner" && (
            <button
              onClick={remove}
              className="shrink-0 rounded-full border border-red-500/40 px-4 py-1.5 text-xs text-red-500 transition hover:bg-red-500/10"
            >
              Delete website
            </button>
          )}
        </div>
      </Panel>

      {(msg || err) && (
        <p className={"text-sm lg:col-span-2 " + (err ? "text-red-500" : "text-accent")}>
          {err || msg}
        </p>
      )}
    </div>
  );
}
