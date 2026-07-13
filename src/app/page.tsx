import type { Metadata } from "next";
import { getPortalSnapshot } from "@/lib/catalog";
import { Portal } from "@/components/portal";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const snapshot = getPortalSnapshot();
  return { title: `${snapshot.project.name} · Atlas`, description: snapshot.project.description };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; search?: string }> }) {
  const requested = await searchParams;
  const query = requested.q?.slice(0, 256) ?? "";
  return <Portal initialSnapshot={getPortalSnapshot()} initialQuery={query} initialSearchOpen={requested.search === "1" || Boolean(query)} />;
}
