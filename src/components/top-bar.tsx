"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme";
import { BillingButton } from "./billing";

export function TopBar({
  email,
  plan,
  hasCustomer,
}: {
  email: string;
  plan: "free" | "pro";
  hasCustomer: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-fg text-[10px] font-bold text-bg">
            S
          </span>
          SidFast
        </Link>
        <div className="flex items-center gap-2">
          <BillingButton plan={plan} hasCustomer={hasCustomer} />
          <ThemeToggle />
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex h-8 items-center gap-2 rounded-full border border-line px-3 text-xs text-fg-soft transition hover:border-line-strong hover:text-fg"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-fg">
                {(email[0] || "u").toUpperCase()}
              </span>
              <span className="hidden max-w-[160px] truncate sm:block">
                {email}
              </span>
            </button>
            {open && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-bg py-1 shadow-[var(--shadow)]">
                  <MenuItem onClick={() => { setOpen(false); router.push("/dashboard"); }}>
                    All websites
                  </MenuItem>
                  <button
                    onClick={() => {
                      setOpen(false);
                      logout();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-fg-soft transition hover:bg-panel"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-sm text-fg-soft transition hover:bg-panel"
    >
      {children}
    </button>
  );
}
