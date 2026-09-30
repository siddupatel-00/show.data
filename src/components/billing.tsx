"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "forever",
    items: ["3 websites", "12 months of data", "Unlimited team members"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$12",
    note: "per month",
    items: ["Unlimited websites", "5 years of data", "API & webhooks"],
    cta: "Upgrade to Pro",
    featured: true,
  },
];

async function post(path: string): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export function PricingCards() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upgrade() {
    setBusy(true);
    setError("");
    try {
      const me = await fetch("/api/auth/me");
      if (!me.ok) {
        router.push("/signup?plan=pro");
        return;
      }
      const res = await post("/api/stripe/checkout");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Checkout is unavailable right now.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {PLANS.map((p) => (
        <div
          key={p.name}
          className={
            "flex flex-col rounded-xl border p-6 " +
            (p.featured
              ? "border-accent bg-accent-soft"
              : "border-line bg-bg")
          }
        >
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">{p.name}</h3>
            {p.featured && (
              <span className="text-xs font-medium text-accent">Popular</span>
            )}
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight">
              {p.price}
            </span>
            <span className="text-xs text-muted">{p.note}</span>
          </div>
          <ul className="mt-5 flex-1 space-y-2 text-sm text-fg-soft">
            {p.items.map((i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">✓</span>
                {i}
              </li>
            ))}
          </ul>
          {p.featured ? (
            <button
              type="button"
              disabled={busy}
              onClick={upgrade}
              className="mt-6 rounded-full bg-accent px-4 py-2 text-center text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Redirecting…" : p.cta}
            </button>
          ) : (
            <Link
              href="/signup"
              className="mt-6 rounded-full border border-line px-4 py-2 text-center text-sm font-medium text-fg transition hover:border-line-strong"
            >
              {p.cta}
            </Link>
          )}
        </div>
      ))}
      {error && (
        <p className="col-span-full text-center text-sm text-danger">{error}</p>
      )}
    </div>
  );
}

export function BillingButton({
  plan,
  hasCustomer,
}: {
  plan: "free" | "pro";
  hasCustomer: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function click() {
    setBusy(true);
    setError("");
    try {
      const path = plan === "pro" ? "/api/stripe/portal" : "/api/stripe/checkout";
      const res = await post(path);
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Billing is unavailable on this deployment.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={click}
        className={
          plan === "pro"
            ? "rounded-full border border-line px-3 py-1.5 text-xs text-fg-soft transition hover:border-line-strong hover:text-fg"
            : "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:opacity-90"
        }
      >
        {busy
          ? "Working…"
          : plan === "pro"
            ? hasCustomer
              ? "Manage billing"
              : "Pro"
            : "Upgrade"}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
