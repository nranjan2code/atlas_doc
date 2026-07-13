import { createHash } from "node:crypto";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { readAsset } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};

export function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path") ?? "";
  if (!requestedPath || requestedPath.length > 1_024) return NextResponse.json({ error: "A valid asset path is required." }, { status: 400 });
  const asset = readAsset(requestedPath);
  if (!asset) return NextResponse.json({ error: "Asset is not present in the active Atlas snapshot." }, { status: 404 });
  const etag = `"${createHash("sha256").update(asset.content).digest("hex").slice(0, 24)}"`;
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  const extension = path.extname(asset.entry.path).toLowerCase();
  return new NextResponse(new Uint8Array(asset.content), {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Content-Length": String(asset.content.length),
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    },
  });
}
