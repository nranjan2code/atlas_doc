"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Command,
  FileCode2,
  Folder,
  FolderGit2,
  LoaderCircle,
  Search,
  Terminal,
  X,
} from "lucide-react";
import type { PortalSnapshot, SearchHit } from "@/lib/types";

function formatNumber(value: number): string { return new Intl.NumberFormat("en-US").format(value); }

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 ** 2) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_024 ** 2).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function source(filePath: string, line?: number | null): string {
  const start = line && line > 750 ? `&start=${Math.max(1, line - 333)}` : "";
  return `/source?path=${encodeURIComponent(filePath)}${start}${line ? `#L${line}` : ""}`;
}

export function Portal({ initialSnapshot, initialQuery = "", initialSearchOpen = false }: { initialSnapshot: PortalSnapshot; initialQuery?: string; initialSearchOpen?: boolean }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(initialSearchOpen || Boolean(initialQuery));
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "reconnecting" | "error">("connecting");
  const [activeIndex, setActiveIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const fingerprintRef = useRef(snapshot.fingerprint);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isCodeProfile = snapshot.profile === "code";
  const topFormats = useMemo(() => snapshot.facts.formats.slice(0, 8), [snapshot]);
  const onboarding = useMemo(() => snapshot.entries.slice(0, 8), [snapshot]);
  const featuredSymbols = useMemo(() => {
    const names = new Set<string>();
    const generic = new Set(["config", "dynamic", "metadata"]);
    return snapshot.symbols.filter((symbol) => !generic.has(symbol.name.toLowerCase()) && !names.has(symbol.name) && Boolean(names.add(symbol.name))).slice(0, 8);
  }, [snapshot]);

  const searchTriggerRef = useRef<HTMLElement | null>(null);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.setTimeout(() => (searchTriggerRef.current ?? searchButtonRef.current)?.focus(), 0);
  }, []);

  const openSearch = useCallback((nextQuery?: string, trigger?: HTMLElement) => {
    if (nextQuery !== undefined) setQuery(nextQuery);
    if (trigger) searchTriggerRef.current = trigger;
    setSearchOpen(true);
  }, []);

  useEffect(() => { fingerprintRef.current = snapshot.fingerprint; }, [snapshot.fingerprint]);

  useEffect(() => {
    let active = true;
    const events = new EventSource("/api/events");
    events.onopen = () => { if (active) setLiveStatus("live"); };
    events.onerror = () => { if (active) setLiveStatus("reconnecting"); };
    events.addEventListener("index-error", () => { if (active) setLiveStatus("error"); });
    events.addEventListener("snapshot", async (event) => {
      try {
        const { fingerprint } = JSON.parse((event as MessageEvent).data) as { fingerprint: string };
        if (!active || fingerprint === fingerprintRef.current) return;
        const response = await fetch("/api/catalog?view=portal", { cache: "no-store" });
        if (!response.ok) throw new Error("Snapshot refresh failed");
        const next = await response.json() as PortalSnapshot;
        if (active) { fingerprintRef.current = next.fingerprint; setSnapshot(next); setLiveStatus("live"); }
      } catch { if (active) setLiveStatus("error"); }
    });
    return () => { active = false; events.close(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchTriggerRef.current = searchButtonRef.current;
        setSearchOpen(true);
      }
      if (event.key === "Escape" && searchOpen) closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (searchOpen) {
      url.searchParams.set("search", "1");
      if (query.trim()) url.searchParams.set("q", query.trim()); else url.searchParams.delete("q");
    } else {
      url.searchParams.delete("search");
      url.searchParams.delete("q");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [query, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [searchOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); setSearchStatus("idle"); setActiveIndex(0); return; }
    const controller = new AbortController();
    setSearchStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const payload = await response.json() as { results: SearchHit[] };
        setResults(payload.results);
        setActiveIndex(0);
        setSearchStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchStatus("error");
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, retryKey]);

  useEffect(() => {
    if (searchStatus !== "ready" || !results[activeIndex]) return;
    document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results, searchStatus]);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + results.length) % results.length); }
    if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); window.location.assign(source(results[activeIndex].entry.path, results[activeIndex].line)); }
  };

  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("input, button, a[href]")].filter((element) => !element.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const copyCommand = async (name: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(name);
      window.setTimeout(() => setCopiedCommand((current) => current === name ? null : current), 1_600);
    } catch { setCopiedCommand(null); }
  };

  const gitLabel = snapshot.git.available
    ? `${snapshot.git.branch || "detached"} · ${snapshot.git.head || "uncommitted"}${snapshot.git.dirtyPaths ? ` · ${formatNumber(snapshot.git.dirtyPaths)} changed` : ""}`
    : "local directory";

  return <main style={{ "--accent": snapshot.portal.accent } as CSSProperties}>
    <div aria-hidden={searchOpen || undefined} inert={searchOpen}>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Atlas home"><span>A</span><strong>Atlas</strong><small>workspace portal</small></a>
      <button ref={searchButtonRef} className="search-button" onClick={(event) => openSearch(undefined, event.currentTarget)} aria-haspopup="dialog" aria-label="Search this workspace">
        <Search size={16} aria-hidden="true"/><span className="search-copy">Search this workspace</span><kbd><Command size={12} aria-hidden="true"/>K</kbd>
      </button>
      <div className="identity" title={`Index connection: ${liveStatus}`}><i className={`pulse ${liveStatus}`}/><span>{gitLabel}</span></div><p className="visually-hidden" aria-live="polite">Index connection {liveStatus}</p>
    </header>

    <section className="hero" id="top">
      <div className="eyebrow">LIVE WORKSPACE MAP · SNAPSHOT {snapshot.fingerprint.slice(0, 8)}{snapshot.stats.limited ? " · SEARCH COVERAGE LIMITED" : ""}</div>
      <h1>{snapshot.project.name}</h1>
      <p>{snapshot.project.description}</p>
      <div className="hero-actions">
        <button onClick={(event) => openSearch(undefined, event.currentTarget)}>Search the workspace <Search size={16} aria-hidden="true"/></button>
        <a href="/browse">Browse every artifact <Folder size={16} aria-hidden="true"/></a>
        <a href="/llms.txt" className="quiet-action">Agent entrypoint <Terminal size={16} aria-hidden="true"/></a>
      </div>
    </section>

    <section className="metrics" aria-label="Workspace index statistics">
      <Metric icon={FileCode2} label="Indexed files" value={formatNumber(snapshot.stats.files)}/>
      <Metric icon={BookOpen} label="Documentation" value={formatNumber(snapshot.stats.docs)}/>
      <Metric icon={Code2} label={isCodeProfile ? "Source files" : "Structured artifacts"} value={formatNumber(snapshot.stats.sourceFiles)}/>
      <Metric icon={Braces} label={isCodeProfile ? "Symbols" : "Anchors"} value={formatNumber(snapshot.stats.symbols)}/>
      <Metric icon={FolderGit2} label="Indexed text" value={formatBytes(snapshot.stats.bytes)}/>
    </section>

    <section className="grid-section" aria-label="Workspace orientation">
      <div className="panel wide">
        <div className="section-title"><span>01</span><div><small>START HERE</small><h2>Read the project in authority order.</h2></div><a href="/browse">View all <ChevronRight size={14}/></a></div>
        <div className="source-list">{onboarding.map((entry, index) => <a href={source(entry.path)} key={entry.id}>
          <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{entry.title}</strong><small>{entry.authorityLabel ?? entry.kind} · {entry.path}</small></div><em>{entry.canonical ? "canonical" : entry.language ?? entry.kind}</em>
        </a>)}{!onboarding.length && <p className="panel-empty">No indexable text sources were found. Check the project include and exclude rules.</p>}</div>
      </div>
      <div className="panel">
        <div className="section-title"><span>02</span><div><small>{isCodeProfile ? "STACK" : "FORMATS"}</small><h2>{isCodeProfile ? "Languages" : "Formats"}</h2></div></div>
        <div className="language-list">{topFormats.map((format) => <button key={format.name} onClick={(event) => openSearch(`language:${format.name}`, event.currentTarget)}>
          <span>{format.name}</span><strong>{formatNumber(format.files)}</strong><i style={{ width: `${Math.max(8, format.files / (topFormats[0]?.files || 1) * 100)}%` }}/>
        </button>)}{!topFormats.length && <p className="panel-empty">No recognized text formats were detected.</p>}</div>
      </div>
      <div className="panel">
        <div className="section-title"><span>03</span><div><small>ACTIONS</small><h2>{isCodeProfile ? "Project commands" : "Workspace actions"}</h2></div></div>
        <div className="command-list">{snapshot.facts.commands.slice(0, 8).map((item) => <div key={item.name}>
          <span>{item.name}</span><code>{item.command}</code><button onClick={() => copyCommand(item.name, item.command)} aria-label={copiedCommand === item.name ? `${item.name} command copied` : `Copy ${item.name} command`} title="Copy command">{copiedCommand === item.name ? <Check size={15}/> : <Clipboard size={15}/>}</button>
        </div>)}{!snapshot.facts.commands.length && <p>{isCodeProfile ? "No supported run actions were detected in this workspace." : "No workspace actions were declared."}</p>}</div>
      </div>
    </section>

    <section className="discovery-section" aria-label="Project map">
      <div className="panel">
        <div className="section-title"><span>04</span><div><small>WORKSPACE MAP</small><h2>{isCodeProfile ? "Code areas" : "Collections"}</h2></div><a href="/browse">Open catalog <ArrowUpRight size={14}/></a></div>
        <div className="area-list">{snapshot.facts.directories.slice(0, 8).map((directory) => <button key={directory.path} onClick={(event) => openSearch(`path:${directory.path}`, event.currentTarget)}>
          <Folder size={15}/><span>{directory.path}</span><strong>{formatNumber(directory.files)}</strong><ChevronRight size={14}/>
        </button>)}{!snapshot.facts.directories.length && <p className="panel-empty">Code areas appear after Atlas admits the first source.</p>}</div>
      </div>
      <div className="panel">
        <div className="section-title"><span>05</span><div><small>NAVIGATION</small><h2>{isCodeProfile ? "Key symbols" : "Key anchors"}</h2></div><a href="/api/symbols">Anchor API <ArrowUpRight size={14}/></a></div>
        <div className="symbol-list">{featuredSymbols.map((symbol) => <a href={source(symbol.path, symbol.line)} key={symbol.id}>
          <Braces size={15}/><div><strong>{symbol.name}</strong><small>{symbol.path}:{symbol.line}</small></div><em>{symbol.language}</em>
        </a>)}{!featuredSymbols.length && <p className="panel-empty">No navigational symbols were extracted for this project.</p>}</div>
      </div>
    </section>

    <section className="agent-band">
      <div><small>FOR HUMANS AND AGENTS</small><h2>One source-linked map. No copied documentation database.</h2><p>Every result carries repository provenance and a stable source path.</p></div>
      <div>
        <a href="/api/context?q=architecture"><code>GET /api/context?q=architecture</code><ArrowUpRight size={15}/></a>
        <a href="/api/search?q=kind%3Atest"><code>GET /api/search?q=kind:test</code><ArrowUpRight size={15}/></a>
        <a href="/api/symbols?q=client"><code>GET /api/symbols?q=client</code><ArrowUpRight size={15}/></a>
      </div>
    </section>

    <footer><strong>Atlas</strong><span>{formatNumber(snapshot.stats.files)} indexed artifacts · refreshed {formatTimestamp(snapshot.generatedAt)}</span><a href="/api/health">API health</a><a href="/llms.txt">llms.txt</a></footer>
    </div>

    {searchOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSearch(); }}>
      <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="search-title" onKeyDown={trapDialogFocus}>
        <h2 id="search-title" className="visually-hidden">Search {snapshot.project.name}</h2>
        <div className="search-field"><Search size={20} aria-hidden="true"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search artifacts, concepts, or anchors…" aria-label="Search artifacts, concepts, or anchors" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="search-results" aria-activedescendant={searchStatus === "ready" && results[activeIndex] ? `search-result-${activeIndex}` : undefined}/><button onClick={closeSearch} aria-label="Close search"><X size={18}/></button></div>
        <div className="search-meta"><span>Filter with <code>language:</code> <code>kind:</code> <code>path:</code></span><kbd>↑↓ navigate · ↵ open · esc close</kbd></div>
        <div className="results" id="search-results" role={searchStatus === "ready" && results.length ? "listbox" : undefined} aria-label="Search results">
          {searchStatus === "loading" && <div className="search-state"><LoaderCircle className="spin" size={20}/><p>Searching the live index…</p></div>}
          {searchStatus === "error" && <div className="search-state"><p>Search could not reach the index.</p><button onClick={() => setRetryKey((value) => value + 1)}>Try again</button></div>}
          {searchStatus === "idle" && <div className="search-welcome">
            <small>SEARCH THE COMPLETE WORKSPACE</small><h3>Find an artifact, concept, or anchor.</h3>
            <div className="quick-filters"><button onClick={() => setQuery("kind:documentation")}>Documentation</button><button onClick={() => setQuery("kind:test")}>Verification</button>{topFormats.slice(0, 3).map((format) => <button key={format.name} onClick={() => setQuery(`language:${format.name}`)}>{format.name}</button>)}</div>
            <div className="suggested-list">{onboarding.slice(0, 5).map((entry) => <a href={source(entry.path)} key={entry.id}><span><strong>{entry.title}</strong><small>{entry.path}</small></span><ChevronRight size={15}/></a>)}</div>
          </div>}
          {searchStatus === "ready" && results.map(({ entry, matches, line, symbol, snippet }, index) => <a id={`search-result-${index}`} href={source(entry.path, line)} key={entry.id} role="option" aria-selected={index === activeIndex} data-active={index === activeIndex} onMouseEnter={() => setActiveIndex(index)}>
            <div><strong>{symbol ?? entry.title}</strong><span>{symbol ? "symbol" : entry.kind}</span></div><p>{symbol ? `${entry.title} · ${entry.summary}` : entry.summary}</p><code>{entry.path}{line ? `:${line}` : ""}</code><small>{matches.join(" · ")}</small>
            {snippet && <span className="search-snippet">{snippet}</span>}
          </a>)}
          {searchStatus === "ready" && !results.length && <div className="search-state"><p>No indexed source matched “{query}”.</p><button onClick={() => setQuery("")}>Clear search</button></div>}
        </div>
        <p className="visually-hidden" aria-live="polite">{searchStatus === "ready" ? `${results.length} results` : searchStatus === "loading" ? "Searching" : ""}</p>
      </div>
    </div>}
  </main>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof FileCode2; label: string; value: string }) {
  return <div><Icon size={17} aria-hidden="true"/><strong>{value}</strong><span>{label}</span></div>;
}
