export type EntryKind = "contract" | "documentation" | "source" | "configuration" | "test" | "asset" | "other";

export interface AuthorityRule {
  match: string;
  rank: number;
  label?: string;
  canonical?: boolean;
  historical?: boolean;
}

export interface AtlasConfig {
  project: { name: string; description?: string };
  source: { include: string[]; exclude: string[]; maxFileBytes: number; maxFiles: number; maxTotalBytes: number };
  authority: AuthorityRule[];
  portal: { accent: string; profile: "auto" | "code" | "general" };
}

export interface CatalogEntry {
  id: string;
  path: string;
  title: string;
  kind: EntryKind;
  language: string | null;
  summary: string;
  excerpt: string;
  headings: string[];
  updatedAt: string;
  size: number;
  authorityRank: number;
  authorityLabel: string | null;
  canonical: boolean;
  historical: boolean;
}

export interface SymbolEntry {
  id: string;
  name: string;
  kind: string;
  language: string;
  path: string;
  line: number;
  signature: string;
}

export interface ProjectFacts {
  languages: Array<{ name: string; files: number }>;
  formats: Array<{ name: string; files: number }>;
  manifests: string[];
  commands: Array<{ name: string; command: string; source: string }>;
  directories: Array<{ path: string; files: number }>;
}

export interface AtlasSnapshot {
  schemaVersion: 1;
  project: AtlasConfig["project"];
  portal: AtlasConfig["portal"];
  profile: "code" | "general";
  generatedAt: string;
  fingerprint: string;
  git: { available: boolean; head: string | null; branch: string | null; dirtyPaths: number | null };
  stats: { files: number; docs: number; sourceFiles: number; symbols: number; bytes: number; limited: boolean };
  facts: ProjectFacts;
  entries: CatalogEntry[];
  symbols: SymbolEntry[];
}

export type PortalCatalogEntry = Omit<CatalogEntry, "excerpt" | "headings">;

export interface PortalSnapshot extends Omit<AtlasSnapshot, "entries"> {
  entries: PortalCatalogEntry[];
}

export interface SearchHit {
  entry: PortalCatalogEntry;
  score: number;
  matches: string[];
  line: number | null;
  symbol: string | null;
  snippet: string | null;
}
