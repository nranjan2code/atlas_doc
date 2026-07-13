import path from "node:path";

const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".rs": "Rust", ".py": "Python", ".go": "Go", ".java": "Java", ".kt": "Kotlin",
  ".swift": "Swift", ".cs": "C#", ".cpp": "C++", ".cc": "C++", ".c": "C",
  ".rb": "Ruby", ".php": "PHP", ".scala": "Scala", ".sh": "Shell", ".sql": "SQL",
  ".md": "Markdown", ".mdx": "MDX", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML", ".xml": "XML", ".css": "CSS", ".scss": "SCSS", ".html": "HTML",
};

const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp", ".svg"]);

export function languageFor(file: string): string | null {
  return LANGUAGES[path.extname(file).toLowerCase()] ?? null;
}

export function isTextCandidate(file: string): boolean {
  const base = path.basename(file);
  return Boolean(languageFor(file)) || ["Dockerfile", "Makefile", "Procfile", "LICENSE", "AGENTS.md", "README"].includes(base);
}

export function isAssetCandidate(file: string): boolean {
  return ASSET_EXTENSIONS.has(path.extname(file).toLowerCase());
}
