import Link from "next/link";
import { ThemeToggle } from "@/components/theme";
import { HeroPreview } from "@/components/hero-preview";
import { PricingCards } from "@/components/billing";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-fg">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-fg sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pt-20 pb-14 text-center sm:pt-28">
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Know your{" "}
            <span className="font-serif italic text-accent">analytics</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Simple analytics that connects traffic to revenue. No vanity
            metrics, no cookie banners, no clutter.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-24">
          <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow)]">
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="ml-3 truncate text-xs text-muted">
                sidfast.app/demo
              </span>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section id="features" className="border-t border-line bg-panel">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you need, nothing you don&apos;t
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
              {[
                {
                  t: "Revenue attribution",
                  d: "Tie every payment back to the visit that caused it.",
                },
                {
                  t: "Goals & funnels",
                  d: "Track signups and see where people drop off.",
                },
                {
                  t: "Live visitors",
                  d: "Watch traffic arrive in real time, page by page.",
                },
                {
                  t: "UTM breakdowns",
                  d: "Source, medium and campaign — with revenue attached.",
                },
              ].map((f) => (
                <div key={f.t} className="bg-bg p-6">
                  <h3 className="text-[15px] font-medium">{f.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {f.d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-5xl px-5 pb-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Pricing
          </h2>
          <div className="mx-auto mt-10">
            <PricingCards />
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Start finding your revenue
            </h2>
            <Link
              href="/signup"
              className="mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
            >
              Create your account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row">
          <span className="flex items-center gap-2">
            <Logo /> SidFast
          </span>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded bg-fg text-[10px] font-bold text-bg">
        S
      </span>
    </span>
  );
}
