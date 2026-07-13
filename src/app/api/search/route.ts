import { type NextRequest, NextResponse } from "next/server";
import { getSnapshot, search } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length > 256) return NextResponse.json({ error: "Query must be 256 characters or fewer." }, { status: 400 });
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 20;
  const snapshot = getSnapshot();
  return NextResponse.json({
    schemaVersion: 1,
    query,
    snapshot: snapshot.fingerprint,
    results: query ? search(query, limit) : [],
  }, { headers: { "Cache-Control": "no-store" } });
}
