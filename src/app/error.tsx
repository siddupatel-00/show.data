"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg text-muted">
        !
      </div>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        This view hit an unexpected error. Reloading usually fixes it — if it
        keeps happening, the data behind this page may be malformed.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg"
        >
          Reload
        </button>
        <a
          href="/dashboard"
          className="rounded-full border border-line px-5 py-2 text-sm text-fg-soft hover:border-line-strong"
        >
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
