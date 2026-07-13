import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import createIgnore, { type Ignore } from "ignore";
import { minimatch } from "minimatch";
import { loadConfig } from "./config";
import { isAssetCandidate, isTextCandidate, languageFor } from "./languages";
import { extractSymbols } from "./symbols";
import type {
  AtlasConfig,
  AtlasSnapshot,
  AuthorityRule,
  CatalogEntry,
  EntryKind,
  PortalCatalogEntry,
  PortalSnapshot,
  SearchHit,
  SymbolEntry,
} from "./types";

const ROOT = path.resolve(process.env.ATLAS_PROJECT_ROOT ?? process.cwd());
const SCAN_INTERVAL_MS = Math.min(10_000, Math.max(250, Number(process.env.ATLAS_SCAN_INTERVAL_MS) || 1_500));
const MAX_IGNORE_FILES = 250;
const MAX_IGNORE_BYTES = 128_000;
const MAX_PACKAGE_BYTES = 2_000_000;
const MAX_SYMBOLS = 250_000;
const MAX_SEARCH_INDEX_CHARS = 32_000_000;
const MAX_SEARCH_CHARS_PER_FILE = 64_000;

let cached: AtlasSnapshot | null = null;
let lastScanAt = 0;
let cachedSearchText = new Map<string, string>();

type GitState = AtlasSnapshot["git"] & { identity: string };
interface IgnoreRule { base: string; matcher: Ignore }
interface Discovery { files: string[]; limited: boolean }

function git(args: string[]): string | null {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec,
    LANG: "C",
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_COUNT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  const safeConfig = [
    "-c", "core.fsmonitor=false",
    "-c", "core.untrackedCache=false",
    "-c", `core.hooksPath=${nullDevice}`,
    "-c", "submodule.recurse=false",
  ];
  try {
    return execFileSync("git", [...safeConfig, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 2_500,
      maxBuffer: 4_000_000,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return null; }
}

function getGitState(): GitState {
  const available = git(["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!available) return { available: false, head: null, branch: null, dirtyPaths: 0, identity: "local" };
  const head = git(["rev-parse", "--short=12", "HEAD"]);
  const branch = git(["symbolic-ref", "--short", "-q", "HEAD"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=all"]);
  return {
    available: true,
    head,
    branch,
    dirtyPaths: status === null ? null : status ? status.split("\n").length : 0,
    identity: `${head ?? "unborn"}\n${branch ?? "detached"}\n${status ?? "status-unavailable"}`,
  };
}

function globMatches(file: string, pattern: string): boolean {
  return minimatch(file, pattern, { dot: true, matchBase: !pattern.includes("/") });
}

function authorityFor(file: string, rules: AuthorityRule[]): AuthorityRule | null {
  return [...rules].filter((rule) => globMatches(file, rule.match)).sort((a, b) => b.rank - a.rank)[0] ?? null;
}

function kindFor(file: string, language: string | null, rule: AuthorityRule | null): EntryKind {
  if (rule?.rank && rule.rank >= 80) return "contract";
  if (/\.(md|mdx|rst|adoc)$/i.test(file)) return "documentation";
  if (/(^|\/)(test|tests|spec|__tests__)(\/|$)|\.(test|spec)\./i.test(file)) return "test";
  if (/(^|\/)(package\.json|cargo\.toml|pyproject\.toml|go\.mod|pom\.xml|build\.gradle|dockerfile|makefile|tsconfig(?:\.[^.]+)?\.json|[^/]+\.config\.[cm]?[jt]s)$/i.test(file)) return "configuration";
  if (language && !["Markdown", "MDX", "JSON", "YAML", "TOML", "XML"].includes(language)) return "source";
  if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(file)) return "asset";
  return "other";
}

function humanize(value: string): string {
  return value.replace(/\.(d\.)?[cm]?[jt]sx?$/i, "").replace(/[-_.]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function title(file: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*`]/g, "").trim();
  if (heading) return heading;
  const parts = file.split("/");
  const base = path.posix.basename(file, path.posix.extname(file));
  const parent = parts.at(-2) ?? "";
  if (base === "route" && parts.includes("api")) return `${humanize(parent)} API`;
  if (base === "route") return `${humanize(parent)} endpoint`;
  if (base === "page") return parent && parent !== "app" ? `${humanize(parent)} page` : "Home page";
  if (base === "layout") return parent && parent !== "app" ? `${humanize(parent)} layout` : "Root layout";
  if (["index", "main", "mod"].includes(base) && parent) return humanize(parent);
  return humanize(path.posix.basename(file, path.posix.extname(file)));
}

function summarize(file: string, content: string, kind: EntryKind): string {
  if (kind === "documentation" || kind === "contract") {
    const prose = content.replace(/^---[\s\S]*?---/m, "").replace(/```[\s\S]*?```/g, " ")
      .replace(/^#{1,6}\s+.+$/gm, " ").replace(/[*_`|>]/g, " ").replace(/\s+/g, " ").trim();
    return prose.slice(0, 240) || `Documentation from ${file}`;
  }
  return `${kind[0].toUpperCase()}${kind.slice(1)} · ${file}`;
}

function readBuffer(file: string, maxBytes: number): Buffer | null {
  const absolute = path.resolve(ROOT, file);
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) return null;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size > maxBytes) return null;
    return readFileSync(descriptor);
  } catch { return null; }
  finally { if (descriptor !== null) closeSync(descriptor); }
}

function readUtf8(file: string, maxBytes: number): string | null {
  const buffer = readBuffer(file, maxBytes);
  if (buffer === null || buffer.subarray(0, Math.min(buffer.length, 8_000)).includes(0)) return null;
  return buffer.toString("utf8");
}

function loadIgnoreRules(config: AtlasConfig): IgnoreRule[] {
  const ignoreFiles = fg.sync("**/.gitignore", {
    cwd: ROOT,
    onlyFiles: true,
    dot: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: config.source.exclude,
  }).sort();
  if (ignoreFiles.length > MAX_IGNORE_FILES) throw new Error(`Atlas found more than ${MAX_IGNORE_FILES} .gitignore files and stopped rather than ignore safety rules.`);
  const rules: IgnoreRule[] = [];
  for (const file of ignoreFiles) {
    const content = readUtf8(file, MAX_IGNORE_BYTES);
    if (content === null) throw new Error(`Atlas could not safely read ignore rules from ${file}.`);
    rules.push({ base: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file), matcher: createIgnore().add(content) });
  }
  return rules;
}

function ignoredByRepository(file: string, rules: IgnoreRule[]): boolean {
  return rules.some(({ base, matcher }) => {
    if (base && file !== base && !file.startsWith(`${base}/`)) return false;
    const relative = base ? path.posix.relative(base, file) : file;
    return Boolean(relative) && matcher.ignores(relative);
  });
}

function looksSensitive(file: string): boolean {
  const lower = file.toLowerCase();
  const base = path.posix.basename(lower);
  const segments = lower.split("/");
  if (segments.some((segment) => segment === ".ssh" || segment === ".aws" || segment === ".gnupg")) return true;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if ([".npmrc", ".pypirc", ".netrc", "id_rsa", "id_dsa", "id_ed25519", "credentials.json"].includes(base)) return true;
  if (/\.(pem|key|p12|pfx|tfstate)$/.test(base)) return true;
  return /(^|[-_.])(secret|credentials?)([-_.]|$)/.test(base);
}

function discover(config: AtlasConfig): Discovery {
  const rootReal = realpathSync(ROOT);
  const ignoreRules = loadIgnoreRules(config);
  const candidates = fg.sync(config.source.include, {
    cwd: ROOT,
    onlyFiles: true,
    dot: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: config.source.exclude,
  }).sort();
  const files: string[] = [];
  let limited = false;
  for (const file of candidates) {
    if (files.length >= config.source.maxFiles) { limited = true; break; }
    const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!normalized || path.posix.isAbsolute(normalized) || normalized.startsWith("../")) throw new Error(`Atlas rejected an out-of-root discovery path: ${file}`);
    if ((!isTextCandidate(normalized) && !isAssetCandidate(normalized)) || looksSensitive(normalized) || ignoredByRepository(normalized, ignoreRules)) continue;
    try {
      const absolute = path.join(ROOT, normalized);
      if (realpathSync(absolute).startsWith(`${rootReal}${path.sep}`) && !lstatSync(absolute).isSymbolicLink()) files.push(normalized);
    } catch { /* Repository changes are retried on the next scan. */ }
  }
  return { files, limited };
}

function fingerprint(files: string[], gitState: GitState, config: AtlasConfig, limited: boolean): string {
  const hash = createHash("sha256").update(gitState.identity).update(JSON.stringify(config)).update(limited ? "limited" : "complete");
  for (const file of files) {
    try {
      const stats = statSync(path.join(ROOT, file));
      hash.update(`${file}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.ino}\n`);
    } catch { hash.update(`${file}:missing\n`); }
  }
  return hash.digest("hex").slice(0, 16);
}

function projectCommands(entries: CatalogEntry[]): Array<{ name: string; command: string; source: string }> {
  try {
    if (!entries.some((entry) => entry.path === "package.json")) return [];
    const raw = readUtf8("package.json", MAX_PACKAGE_BYTES);
    if (raw === null) return [];
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return Object.entries(pkg.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, command]) => ({ name, command, source: "package.json" }));
  } catch { return []; }
}

function directoryFor(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return "(root)";
  if (["src", "app", "apps", "packages", "lib"].includes(parts[0]) && parts.length > 2) return parts.slice(0, 2).join("/");
  return parts[0];
}

function build(files: string[], id: string, config: AtlasConfig, gitState: GitState, initiallyLimited: boolean): AtlasSnapshot {
  const entries: CatalogEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const nextSearchText = new Map<string, string>();
  let searchIndexChars = 0;
  let indexedBytes = 0;
  let limited = initiallyLimited;
  for (const file of files) {
    try {
      const language = languageFor(file);
      const authority = authorityFor(file, config.authority);
      const kind = kindFor(file, language, authority);
      const stats = statSync(path.join(ROOT, file));
      if (stats.size > config.source.maxFileBytes) continue;
      if (indexedBytes + stats.size > config.source.maxTotalBytes) { limited = true; continue; }
      const content = kind === "asset" ? "" : readUtf8(file, config.source.maxFileBytes);
      if (content === null) continue;
      if (kind !== "asset" && searchIndexChars < MAX_SEARCH_INDEX_CHARS) {
        const searchable = content.slice(0, Math.min(MAX_SEARCH_CHARS_PER_FILE, MAX_SEARCH_INDEX_CHARS - searchIndexChars)).toLowerCase();
        nextSearchText.set(file, searchable);
        searchIndexChars += searchable.length;
      }
      entries.push({
        id: createHash("sha1").update(file).digest("hex").slice(0, 12),
        path: file,
        title: title(file, content),
        kind,
        language,
        summary: summarize(file, content, kind),
        excerpt: content.slice(0, 2_000),
        headings: [...content.matchAll(/^#{2,4}\s+(.+)$/gm)].slice(0, 12).map((match) => match[1].trim()),
        updatedAt: stats.mtime.toISOString(),
        size: stats.size,
        authorityRank: authority?.rank ?? 0,
        authorityLabel: authority?.label ?? null,
        canonical: authority?.canonical ?? false,
        historical: authority?.historical ?? false,
      });
      indexedBytes += stats.size;
      if (kind !== "asset") {
        const extracted = extractSymbols(file, language, content);
        const remaining = Math.max(0, MAX_SYMBOLS - symbols.length);
        symbols.push(...extracted.slice(0, remaining));
        if (extracted.length > remaining) limited = true;
      }
    } catch { /* A file changed during indexing; the next scan will reconcile it. */ }
  }
  const languageCounts = new Map<string, number>();
  const directoryCounts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.language) languageCounts.set(entry.language, (languageCounts.get(entry.language) ?? 0) + 1);
    const directory = directoryFor(entry.path);
    directoryCounts.set(directory, (directoryCounts.get(directory) ?? 0) + 1);
  }
  const { identity: _identity, ...git } = gitState;
  cachedSearchText = nextSearchText;
  return {
    schemaVersion: 1,
    project: config.project,
    portal: config.portal,
    generatedAt: new Date().toISOString(),
    fingerprint: id,
    git,
    stats: {
      files: entries.length,
      docs: entries.filter((entry) => ["contract", "documentation"].includes(entry.kind)).length,
      sourceFiles: entries.filter((entry) => entry.kind === "source").length,
      symbols: symbols.length,
      bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
      limited,
    },
    facts: {
      languages: [...languageCounts].map(([name, count]) => ({ name, files: count })).sort((a, b) => b.files - a.files || a.name.localeCompare(b.name)),
      manifests: entries.filter((entry) => entry.kind === "configuration").map((entry) => entry.path),
      commands: projectCommands(entries),
      directories: [...directoryCounts].map(([directoryPath, count]) => ({ path: directoryPath, files: count })).sort((a, b) => b.files - a.files || a.path.localeCompare(b.path)),
    },
    entries,
    symbols,
  };
}

function compactEntry(entry: CatalogEntry): PortalCatalogEntry {
  const { excerpt: _excerpt, headings: _headings, ...compact } = entry;
  return compact;
}

function entryPriority(entry: CatalogEntry): number {
  const kindScore: Record<EntryKind, number> = { contract: 80, documentation: 60, configuration: 40, source: 25, test: 15, asset: 5, other: 0 };
  const noisePenalty = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|next-env\.d\.ts)$/i.test(entry.path) ? 80 : 0;
  const entrypointBonus = /(^|\/)(index|main|app|page|mod)\.[cm]?[jt]sx?$/i.test(entry.path) ? 25 : 0;
  const manifestBonus = /(^|\/)package\.json$/i.test(entry.path) ? 30 : 0;
  return entry.authorityRank * 10 + (entry.canonical ? 200 : 0) + kindScore[entry.kind] + entrypointBonus + manifestBonus - noisePenalty;
}

export function toPortalSnapshot(snapshot: AtlasSnapshot): PortalSnapshot {
  const entries = [...snapshot.entries]
    .sort((a, b) => entryPriority(b) - entryPriority(a) || a.path.localeCompare(b.path))
    .slice(0, 32)
    .map(compactEntry);
  const entryRanks = new Map(snapshot.entries.map((entry) => [entry.path, entryPriority(entry)]));
  const symbols = [...snapshot.symbols]
    .sort((a, b) => (entryRanks.get(b.path) ?? 0) - (entryRanks.get(a.path) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 16);
  return { ...snapshot, entries, symbols };
}

function parseSearchQuery(query: string): { terms: string[]; language: string | null; kind: string | null; path: string | null } {
  const tokens = (query.slice(0, 256).match(/"[^"]+"|\S+/g) ?? []).slice(0, 16);
  const terms: string[] = [];
  let language: string | null = null;
  let kind: string | null = null;
  let pathFilter: string | null = null;
  for (const raw of tokens) {
    const token = raw.replace(/^"|"$/g, "");
    const separator = token.indexOf(":");
    const key = separator > 0 ? token.slice(0, separator).toLowerCase() : "";
    const value = separator > 0 ? token.slice(separator + 1).toLowerCase() : "";
    if (key === "language" || key === "lang") language = value;
    else if (key === "kind" || key === "type") kind = value;
    else if (key === "path") pathFilter = value;
    else if (token.length > 1) terms.push(token.toLowerCase());
  }
  return { terms, language, kind, path: pathFilter };
}

export function getProjectRoot(): string { return ROOT; }

export function getSnapshot(): AtlasSnapshot {
  const now = Date.now();
  if (cached && now - lastScanAt < SCAN_INTERVAL_MS) return cached;
  const config = loadConfig(ROOT);
  const discovery = discover(config);
  const gitState = getGitState();
  const id = fingerprint(discovery.files, gitState, config, discovery.limited);
  if (cached?.fingerprint === id) { lastScanAt = Date.now(); return cached; }
  cached = build(discovery.files, id, config, gitState, discovery.limited);
  lastScanAt = Date.now();
  return cached;
}

export function getPortalSnapshot(): PortalSnapshot { return toPortalSnapshot(getSnapshot()); }

export function search(query: string, limit = 20): SearchHit[] {
  const snapshot = getSnapshot();
  const parsed = parseSearchQuery(query);
  if (!parsed.terms.length && !parsed.language && !parsed.kind && !parsed.path) return [];
  const symbolsByPath = new Map<string, SymbolEntry[]>();
  for (const symbol of snapshot.symbols) symbolsByPath.set(symbol.path, [...(symbolsByPath.get(symbol.path) ?? []), symbol]);
  return snapshot.entries.map((entry): SearchHit | null => {
    if (parsed.language && entry.language?.toLowerCase() !== parsed.language) return null;
    if (parsed.kind && entry.kind.toLowerCase() !== parsed.kind) return null;
    if (parsed.path === "(root)" ? entry.path.includes("/") : parsed.path && !entry.path.toLowerCase().includes(parsed.path)) return null;
    const entrySymbols = symbolsByPath.get(entry.path) ?? [];
    const fields = {
      title: entry.title.toLowerCase(),
      path: entry.path.toLowerCase(),
      summary: entry.summary.toLowerCase(),
      language: entry.language?.toLowerCase() ?? "",
      kind: entry.kind.toLowerCase(),
      content: cachedSearchText.get(entry.path) ?? `${entry.excerpt} ${entry.headings.join(" ")}`.toLowerCase(),
      symbol: entrySymbols.map((symbol) => `${symbol.name} ${symbol.signature}`).join(" ").toLowerCase(),
    };
    let score = entry.authorityRank / 20 + (entry.canonical ? 4 : 0);
    const matches = new Set<string>();
    for (const term of parsed.terms) {
      let matched = false;
      for (const [field, value] of Object.entries(fields)) {
        if (!value.includes(term)) continue;
        matched = true;
        matches.add(field);
        score += field === "title" ? 14 : field === "path" ? 9 : field === "symbol" ? 12 : field === "language" || field === "kind" ? 6 : field === "summary" ? 4 : 1;
      }
      if (!matched) return null;
    }
    if (parsed.language) { matches.add("language"); score += 6; }
    if (parsed.kind) { matches.add("kind"); score += 6; }
    if (parsed.path) { matches.add("path"); score += 6; }
    if (entry.historical) score -= 5;
    const matchedSymbol = entrySymbols.find((symbol) => parsed.terms.some((term) => `${symbol.name} ${symbol.signature}`.toLowerCase().includes(term))) ?? null;
    return {
      entry: compactEntry(entry),
      score: Math.max(0, score),
      matches: [...matches],
      line: matchedSymbol?.line ?? null,
      symbol: matchedSymbol?.name ?? null,
    };
  }).filter((hit): hit is SearchHit => hit !== null)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 100));
}

export function readSource(relative: string): { entry: CatalogEntry; content: string } | null {
  const normalized = relative.replace(/^\/+/, "");
  const entry = getSnapshot().entries.find((candidate) => candidate.path === normalized);
  if (!entry) return null;
  if (entry.kind === "asset") return readBuffer(normalized, Math.max(1, entry.size)) === null ? null : { entry, content: "" };
  const content = readUtf8(normalized, Math.max(1, entry.size));
  return content === null ? null : { entry, content };
}

export function readAsset(relative: string): { entry: CatalogEntry; content: Buffer } | null {
  const normalized = relative.replace(/^\/+/, "");
  const entry = getSnapshot().entries.find((candidate) => candidate.path === normalized && candidate.kind === "asset");
  if (!entry) return null;
  const content = readBuffer(normalized, Math.max(1, entry.size));
  return content === null ? null : { entry, content };
}
