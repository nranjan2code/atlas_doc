import { type NextRequest, NextResponse } from "next/server";
import { getSnapshot } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase().slice(0, 256) ?? "";
  const language = (request.nextUrl.searchParams.get("format") ?? request.nextUrl.searchParams.get("language"))?.trim().slice(0, 80) ?? "";
  const snapshot = getSnapshot();
  const results = snapshot.symbols
    .filter((symbol) => (!query || `${symbol.name} ${symbol.path} ${symbol.signature}`.toLowerCase().includes(query)) && (!language || symbol.language === language))
    .slice(0, 100)
    .map((symbol) => ({ ...symbol, source: `/source?path=${encodeURIComponent(symbol.path)}#L${symbol.line}`, raw: `/api/source?path=${encodeURIComponent(symbol.path)}&start=${symbol.line}&end=${symbol.line}` }));
  return NextResponse.json({ schemaVersion: 1, query, format: language || null, snapshot: snapshot.fingerprint, results }, { headers: { "Cache-Control": "no-store" } });
}
