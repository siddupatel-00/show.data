"use client";

export default function ShareError({
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
      <h1 className="text-lg font-semibold">This dashboard couldn’t load</h1>
      <p className="max-w-sm text-sm text-muted">
        Something went wrong while rendering the shared dashboard. Try again —
        if it keeps failing, the share link may be outdated.
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg"
      >
        Reload
      </button>
    </div>
  );
}
