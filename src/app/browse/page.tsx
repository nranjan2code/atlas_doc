import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, FileCode2, Folder, Search } from "lucide-react";
import { getSnapshot } from "@/lib/catalog";
import type { EntryKind } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Browse sources · Atlas" };

const PAGE_SIZE = 80;
const KINDS: EntryKind[] = ["contract", "documentation", "source", "configuration", "test", "asset", "other"];

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 ** 2) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_024 ** 2).toFixed(1)} MB`;
}

function entryHref(filePath: string): string { return `/source?path=${encodeURIComponent(filePath)}`; }

function browseHref(params: { q?: string; kind?: string; language?: string; page?: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.kind) query.set("kind", params.kind);
  if (params.language) query.set("language", params.language);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const suffix = query.toString();
  return `/browse${suffix ? `?${suffix}` : ""}`;
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; language?: string; page?: string }> }) {
  const requested = await searchParams;
  const snapshot = getSnapshot();
  const q = requested.q?.trim().slice(0, 256) ?? "";
  const kind = KINDS.includes(requested.kind as EntryKind) ? requested.kind as EntryKind : "";
  const language = snapshot.facts.languages.some((item) => item.name === requested.language) ? requested.language ?? "" : "";
  const normalizedQuery = q.toLowerCase();
  const filtered = snapshot.entries
    .filter((entry) => (!normalizedQuery || (normalizedQuery === "(root)" ? !entry.path.includes("/") : `${entry.title} ${entry.path} ${entry.summary}`.toLowerCase().includes(normalizedQuery))) && (!kind || entry.kind === kind) && (!language || entry.language === language))
    .sort((a, b) => Number(b.canonical) - Number(a.canonical) || b.authorityRank - a.authorityRank || a.path.localeCompare(b.path));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const parsedPage = Number(requested.page ?? 1);
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(parsedPage) ? Math.trunc(parsedPage) : 1));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return <main className="browse-page" style={{ "--accent": snapshot.portal.accent } as React.CSSProperties}>
    <header className="browse-topbar"><Link href="/"><ArrowLeft size={16}/> Atlas</Link><span>{snapshot.project.name}</span><Link href="/?search=1" className="browse-search"><Search size={15}/> Command search</Link></header>
    <section className="browse-hero"><small>COMPLETE SOURCE CATALOG</small><h1>Browse the project.</h1><p>Every indexed source is reachable here. Filter by path, role, or language, then open a stable source-linked view.</p></section>
    <form className="browse-controls" action="/browse" method="get">
      <label><span className="visually-hidden">Filter by file name or path</span><Search size={17}/><input name="q" defaultValue={q} placeholder="Filter files and paths…"/></label>
      <label><span>Kind</span><select name="kind" defaultValue={kind}><option value="">All kinds</option>{KINDS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label><span>Language</span><select name="language" defaultValue={language}><option value="">All languages</option>{snapshot.facts.languages.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label>
      <button type="submit">Apply filters</button>
      {(q || kind || language) && <Link href="/browse">Reset</Link>}
    </form>
    <div className="browse-layout">
      <aside>
        <div className="browse-aside-title"><Folder size={15}/><strong>Code areas</strong></div>
        <Link href="/browse" data-active={!q && !kind && !language}><span>All sources</span><em>{snapshot.stats.files}</em></Link>
        {snapshot.facts.directories.slice(0, 14).map((directory) => <Link href={browseHref({ q: directory.path })} key={directory.path} data-active={q === directory.path}><span>{directory.path}</span><em>{directory.files}</em></Link>)}
      </aside>
      <section className="browse-results" aria-labelledby="catalog-heading">
        <div className="browse-summary"><div><small>CATALOG</small><h2 id="catalog-heading">{filtered.length.toLocaleString("en-US")} {filtered.length === 1 ? "source" : "sources"}</h2></div><span>Snapshot {snapshot.fingerprint.slice(0, 8)}</span></div>
        <div className="catalog-list">{visible.map((entry) => <Link href={entryHref(entry.path)} key={entry.id}>
          <FileCode2 size={17}/><div><strong>{entry.title}</strong><code>{entry.path}</code></div><div className="catalog-tags"><span>{entry.kind}</span>{entry.language && <span>{entry.language}</span>}{entry.canonical && <span className="canonical">canonical</span>}</div><em>{formatBytes(entry.size)}</em><ChevronRight size={15}/>
        </Link>)}</div>
        {!visible.length && <div className="catalog-empty"><h3>No sources match these filters.</h3><p>Try a broader path or reset the catalog.</p><Link href="/browse">Reset filters</Link></div>}
        {totalPages > 1 && <nav className="catalog-pagination" aria-label="Catalog pages">
          {page > 1 ? <Link href={browseHref({ q, kind, language, page: page - 1 })}><ChevronLeft size={15}/> Previous</Link> : <span/>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={browseHref({ q, kind, language, page: page + 1 })}>Next <ChevronRight size={15}/></Link> : <span/>}
        </nav>}
      </section>
    </div>
  </main>;
}
