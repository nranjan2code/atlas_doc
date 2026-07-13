import path from "node:path";

const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".rs": "Rust", ".py": "Python", ".go": "Go", ".java": "Java", ".kt": "Kotlin",
  ".swift": "Swift", ".cs": "C#", ".cpp": "C++", ".cc": "C++", ".c": "C",
  ".rb": "Ruby", ".php": "PHP", ".scala": "Scala", ".sh": "Shell", ".sql": "SQL",
  ".md": "Markdown", ".mdx": "MDX", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML", ".xml": "XML", ".css": "CSS", ".scss": "SCSS", ".html": "HTML",
  ".txt": "Plain text", ".csv": "CSV", ".tsv": "TSV", ".rst": "reStructuredText", ".adoc": "AsciiDoc",
  ".tf": "Terraform", ".hcl": "HCL", ".graphql": "GraphQL", ".gql": "GraphQL", ".proto": "Protocol Buffers",
  ".lua": "Lua", ".ex": "Elixir", ".exs": "Elixir", ".clj": "Clojure", ".r": "R", ".rmd": "R Markdown",
  ".vue": "Vue", ".svelte": "Svelte", ".ipynb": "Jupyter Notebook", ".ini": "INI", ".properties": "Properties",
};

const ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp", ".svg",
  ".pdf", ".docx", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp",
]);

export function languageFor(file: string): string | null {
  return LANGUAGES[path.extname(file).toLowerCase()] ?? null;
}

export function isTextCandidate(file: string): boolean {
  // Atlas is artifact-first: an extension is a hint for presentation, never an
  // admission gate. Binary detection happens after a bounded safe read.
  return true;
}

export function isAssetCandidate(file: string): boolean {
  return ASSET_EXTENSIONS.has(path.extname(file).toLowerCase());
}
