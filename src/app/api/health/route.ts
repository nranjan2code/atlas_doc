import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export function GET() { const snapshot = getSnapshot(); return NextResponse.json({ schemaVersion: 1, status: "ok", workspace: snapshot.project.name, profile: snapshot.profile, fingerprint: snapshot.fingerprint, generatedAt: snapshot.generatedAt, git: snapshot.git, stats: snapshot.stats }, { headers: { "Cache-Control": "no-store" } }); }
