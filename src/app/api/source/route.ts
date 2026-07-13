import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readSource } from "@/lib/catalog";

export const dynamic = "force-dynamic";

function positiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

export function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path") ?? "";
  if (!requestedPath || requestedPath.length > 1_024) return NextResponse.json({ error: "A valid source path is required." }, { status: 400 });
  const source = readSource(requestedPath);
  if (!source) return NextResponse.json({ error: "Source is not present in the active Atlas snapshot." }, { status: 404 });
  if (source.entry.kind === "asset") return NextResponse.json({ error: "Binary assets are available through /api/asset.", asset: `/api/asset?path=${encodeURIComponent(source.entry.path)}` }, { status: 415 });
  const start = positiveInteger(request.nextUrl.searchParams.get("start"));
  const end = positiveInteger(request.nextUrl.searchParams.get("end"));
  if (Number.isNaN(start) || Number.isNaN(end) || (start !== null && end !== null && end < start)) {
    return NextResponse.json({ error: "Line ranges must be positive and end at or after start." }, { status: 400 });
  }
  const lines = source.content.split("\n");
  const firstLine = start ?? 1;
  const requestedLastLine = end ?? (start === null ? lines.length : firstLine + 1_999);
  if (firstLine > lines.length) return NextResponse.json({ error: "The requested start line is outside this artifact." }, { status: 416 });
  if (requestedLastLine - firstLine + 1 > 2_000) {
    return NextResponse.json({ error: "A line range may contain at most 2,000 lines." }, { status: 400 });
  }
  const lastLine = Math.min(lines.length, requestedLastLine);
  const content = lines.slice(firstLine - 1, lastLine).join("\n");
  const etag = `"${createHash("sha256").update(content).digest("hex").slice(0, 24)}"`;
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Atlas-Path": encodeURIComponent(source.entry.path),
      "X-Atlas-Line-Range": `${firstLine}-${Math.min(lastLine, lines.length)}`,
      ETag: etag,
    },
  });
}
