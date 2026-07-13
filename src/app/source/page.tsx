import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Braces, ChevronRight, FileCode2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSnapshot, readSource } from "@/lib/catalog";
import { LineAnchorScroller } from "@/components/line-anchor-scroller";
import { SourceActions } from "@/components/source-actions";

export const dynamic = "force-dynamic";
const RENDER_LINE_LIMIT = 1_000;

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) return nodeText((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function repositoryPath(from: string, target: string): string | null {
  const filePath = target.split(/[?#]/, 1)[0];
  const relative = filePath.startsWith("/") ? filePath.slice(1) : path.posix.join(path.posix.dirname(from), filePath);
  const normalized = path.posix.normalize(relative);
  return !normalized || normalized === "." || normalized.startsWith("../") ? null : normalized;
}

function markdownHref(from: string, href: string | undefined): { href: string; external: boolean } {
  if (!href) return { href: "#", external: false };
  if (href.startsWith("#")) return { href, external: false };
  if (/^https?:\/\//i.test(href)) return { href, external: true };
  if (/^mailto:/i.test(href)) return { href, external: false };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { href: "#", external: false };
  const [, fragment] = href.split("#", 2);
  const normalized = repositoryPath(from, href);
  if (!normalized) return { href: "#", external: false };
  return { href: `/source?path=${encodeURIComponent(normalized)}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`, external: false };
}

function markdownImageHref(from: string, source: string | undefined): string | null {
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return source;
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return null;
  const normalized = repositoryPath(from, source);
  return normalized ? `/api/asset?path=${encodeURIComponent(normalized)}` : null;
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  return `${(value / 1_024).toFixed(1)} KB`;
}

const CODE_KEYWORDS = new Set(["abstract", "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "default", "defer", "do", "else", "enum", "export", "extends", "false", "final", "finally", "fn", "for", "from", "func", "function", "if", "implements", "import", "in", "interface", "let", "match", "mod", "new", "nil", "null", "package", "private", "protected", "pub", "public", "return", "self", "static", "struct", "super", "switch", "this", "throw", "trait", "true", "try", "type", "undefined", "use", "var", "while", "with", "yield"]);
const CODE_TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|--.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;

function highlightLine(line: string, language: string | null): ReactNode[] {
  const hashComments = ["Python", "Ruby", "Shell", "YAML"].includes(language ?? "");
  const sqlComments = language === "SQL";
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(CODE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(line.slice(cursor, index));
    const token = match[0];
    const className = token.startsWith("//") || (hashComments && token.startsWith("#")) || (sqlComments && token.startsWith("--"))
      ? "token-comment"
      : /^["'`]/.test(token) ? "token-string"
        : /^\d/.test(token) ? "token-number"
          : CODE_KEYWORDS.has(token) ? "token-keyword" : undefined;
    nodes.push(className ? <span className={className} key={`${index}-${token}`}>{token}</span> : token);
    cursor = index + token.length;
    if (className === "token-comment") break;
  }
  if (cursor < line.length) nodes.push(line.slice(cursor));
  return nodes.length ? nodes : [" "];
}

export default async function SourcePage({ searchParams }: { searchParams: Promise<{ path?: string; start?: string }> }) {
  const params = await searchParams;
  const requested = params.path ?? "";
  const source = readSource(requested);
  if (!source) notFound();
  const snapshot = getSnapshot();
  const markdown = /\.(md|mdx)$/i.test(source.entry.path);
  const asset = source.entry.kind === "asset";
  const imageAsset = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg)$/i.test(source.entry.path);
  const entries = [...snapshot.entries].sort((a, b) => a.path.localeCompare(b.path));
  const index = entries.findIndex((entry) => entry.path === source.entry.path);
  const previous = index > 0 ? entries[index - 1] : null;
  const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;
  const symbols = snapshot.symbols.filter((symbol) => symbol.path === source.entry.path);
  const allLines = asset ? [] : source.content.split("\n");
  const requestedStart = Number(params.start ?? 1);
  const firstRenderedLine = Number.isInteger(requestedStart) && requestedStart > 0 ? Math.min(requestedStart, Math.max(1, allLines.length)) : 1;
  const renderedLines = allLines.slice(firstRenderedLine - 1, firstRenderedLine - 1 + RENDER_LINE_LIMIT);
  const lastRenderedLine = firstRenderedLine + renderedLines.length - 1;
  const visibleSymbols = symbols.filter((symbol) => symbol.line >= firstRenderedLine && symbol.line <= lastRenderedLine);
  const lineHref = (line: number) => `/source?path=${encodeURIComponent(source.entry.path)}${allLines.length > RENDER_LINE_LIMIT ? `&start=${Math.max(1, line - Math.floor(RENDER_LINE_LIMIT / 3))}` : ""}#L${line}`;
  const segments = source.entry.path.split("/");
  const rawHref = `/api/source?path=${encodeURIComponent(source.entry.path)}`;
  const headingCounts = new Map<string, number>();
  const headingId = (children: ReactNode) => {
    const base = slugify(nodeText(children)) || "section";
    const count = headingCounts.get(base) ?? 0;
    headingCounts.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };

  return <main className="reader" style={{ "--accent": snapshot.portal.accent } as React.CSSProperties}>
    <LineAnchorScroller/>
    <nav className="reader-topbar"><Link href="/"><ArrowLeft size={16}/> Atlas</Link><div>{segments.map((segment, segmentIndex) => <span key={`${segment}-${segmentIndex}`}>{segmentIndex > 0 && <ChevronRight size={12}/>} {segmentIndex < segments.length - 1 ? <Link href={`/browse?q=${encodeURIComponent(segments.slice(0, segmentIndex + 1).join("/"))}`}>{segment}</Link> : <em>{segment}</em>}</span>)}</div><Link href="/browse">Browse project</Link></nav>
    <header className="reader-header">
      <div className="reader-kind"><FileCode2 size={16}/><span>{source.entry.kind} · {source.entry.kind === "asset" ? "image" : source.entry.language ?? "text"}</span>{source.entry.canonical && <strong>canonical</strong>}</div>
      <div className="reader-heading"><div><h1>{source.entry.title}</h1><code>{source.entry.path}</code></div><SourceActions path={source.entry.path} rawHref={asset ? `/api/asset?path=${encodeURIComponent(source.entry.path)}` : rawHref}/></div>
      <div className="reader-facts"><span>{formatBytes(source.entry.size)}</span>{!asset && <span>{allLines.length.toLocaleString("en-US")} lines</span>}{symbols.length > 0 && <span>{symbols.length.toLocaleString("en-US")} anchors</span>}<span>Snapshot {snapshot.fingerprint.slice(0, 8)}</span></div>
    </header>
    <div className={`reader-layout ${visibleSymbols.length ? "with-outline" : ""}`}>
      {visibleSymbols.length > 0 && <aside className="symbol-outline"><small>ANCHORS IN THIS VIEW</small>{visibleSymbols.map((symbol) => <a href={lineHref(symbol.line)} key={symbol.id}><Braces size={13}/><span><strong>{symbol.name}</strong><em>Line {symbol.line}</em></span></a>)}</aside>}
      <article className={asset ? "asset-document" : markdown ? "document" : "code-document"}>
        {asset ? imageAsset ? <figure><img src={`/api/asset?path=${encodeURIComponent(source.entry.path)}`} alt={source.entry.title}/><figcaption>{source.entry.path}</figcaption></figure> : <section className="binary-document"><FileCode2 size={30}/><h2>{source.entry.title}</h2><p>This artifact is indexed for discovery and available through the sandboxed raw endpoint.</p><a href={`/api/asset?path=${encodeURIComponent(source.entry.path)}`}>Open artifact</a></section> : markdown ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({ href, children }) => {
            const resolved = markdownHref(source.entry.path, href);
            return resolved.external ? <a href={resolved.href} target="_blank" rel="noreferrer">{children}</a> : resolved.href.startsWith("mailto:") || resolved.href.startsWith("#") ? <a href={resolved.href}>{children}</a> : <Link href={resolved.href}>{children}</Link>;
          },
          img: ({ src, alt }) => { const resolved = markdownImageHref(source.entry.path, typeof src === "string" ? src : undefined); return resolved ? <img src={resolved} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer"/> : <span className="unavailable-image">Image unavailable: {alt ?? "unnamed image"}</span>; },
          h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
          h4: ({ children }) => <h4 id={headingId(children)}>{children}</h4>,
        }}>{source.content}</ReactMarkdown> : <><div className="code-frame" tabIndex={0} aria-label={`Source code for ${source.entry.path}`}><ol className="code-lines" start={firstRenderedLine}>{renderedLines.map((line, lineIndex) => { const lineNumber = firstRenderedLine + lineIndex; return <li id={`L${lineNumber}`} key={lineNumber}><a href={`#L${lineNumber}`} className="line-number" aria-label={`Line ${lineNumber}`} tabIndex={-1}>{lineNumber}</a><code>{highlightLine(line, source.entry.language)}</code></li>; })}</ol></div>{allLines.length > RENDER_LINE_LIMIT && <nav className="line-pagination" aria-label="Artifact line ranges"><span>Lines {firstRenderedLine.toLocaleString("en-US")}–{lastRenderedLine.toLocaleString("en-US")} of {allLines.length.toLocaleString("en-US")}</span>{firstRenderedLine > 1 && <Link href={`/source?path=${encodeURIComponent(source.entry.path)}&start=${Math.max(1, firstRenderedLine - RENDER_LINE_LIMIT)}`}>Previous lines</Link>}{lastRenderedLine < allLines.length && <Link href={`/source?path=${encodeURIComponent(source.entry.path)}&start=${lastRenderedLine + 1}`}>Next lines</Link>}</nav>}</>}
      </article>
    </div>
    <nav className="reader-pagination" aria-label="Adjacent source files">
      {previous ? <Link href={`/source?path=${encodeURIComponent(previous.path)}`}><ArrowLeft size={16}/><span><small>PREVIOUS</small><strong>{previous.title}</strong><code>{previous.path}</code></span></Link> : <span/>}
      {next ? <Link href={`/source?path=${encodeURIComponent(next.path)}`}><span><small>NEXT</small><strong>{next.title}</strong><code>{next.path}</code></span><ArrowRight size={16}/></Link> : <span/>}
    </nav>
  </main>;
}
