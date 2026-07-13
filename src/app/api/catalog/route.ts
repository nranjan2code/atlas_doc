import { type NextRequest, NextResponse } from "next/server";
import { getSnapshot, toPortalSnapshot } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const snapshot = getSnapshot();
  const view = request.nextUrl.searchParams.get("view") ?? "page";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
  const requestedCursor = Number(request.nextUrl.searchParams.get("cursor") ?? 0);
  const limit = Math.min(1_000, Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 500));
  const cursor = Math.min(snapshot.entries.length, Math.max(0, Number.isFinite(requestedCursor) ? Math.trunc(requestedCursor) : 0));
  const etag = `"${snapshot.fingerprint}-${view}-${cursor}-${limit}"`;
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });

  let payload: unknown;
  if (view === "portal") payload = toPortalSnapshot(snapshot);
  else if (view === "full") payload = snapshot;
  else {
    const { entries: _entries, symbols: _symbols, ...metadata } = snapshot;
    const pageEntries = snapshot.entries.slice(cursor, cursor + limit).map(({ excerpt: _excerpt, headings: _headings, ...entry }) => entry);
    const pagePaths = new Set(pageEntries.map((entry) => entry.path));
    const nextCursor = cursor + pageEntries.length < snapshot.entries.length ? cursor + pageEntries.length : null;
    payload = {
      ...metadata,
      entries: pageEntries,
      symbols: snapshot.symbols.filter((symbol) => pagePaths.has(symbol.path)),
      page: { cursor, limit, returned: pageEntries.length, total: snapshot.entries.length, nextCursor },
    };
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store", ETag: etag } });
}
