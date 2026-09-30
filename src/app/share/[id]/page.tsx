import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteByShareId } from "@/lib/sites";
import { ShareView } from "@/components/share-view";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await getSiteByShareId(id);
  if (!site) notFound();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-fg text-[10px] font-bold text-bg">
              S
            </span>
            {site.name}
            <span className="font-normal text-muted">· public dashboard</span>
          </div>
          <Link
            href="/signup"
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg"
          >
            Get your own
          </Link>
        </div>
      </header>
      <ShareView shareId={site.share_id} domain={site.domain} />
    </div>
  );
}
