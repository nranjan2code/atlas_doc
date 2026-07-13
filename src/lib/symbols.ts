import type { SymbolEntry } from "./types";

type Pattern = { language: string; expression: RegExp; kind: string };
const PATTERNS: Pattern[] = [
  { language: "TypeScript", expression: /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|enum)\s+([\w$]+)/, kind: "export" },
  { language: "JavaScript", expression: /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([\w$]+)/, kind: "export" },
  { language: "Python", expression: /^(?:async\s+)?(?:def|class)\s+([\w_]+)/, kind: "definition" },
  { language: "Rust", expression: /^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const)\s+([\w_]+)/, kind: "public" },
  { language: "Go", expression: /^func\s+(?:\([^)]*\)\s*)?([A-Z][\w]*)/, kind: "export" },
  { language: "Java", expression: /^\s*public\s+(?:static\s+)?(?:class|interface|enum|[\w<>\[\], ?]+)\s+([\w]+)\s*[({]/, kind: "public" },
];

export function extractSymbols(file: string, language: string | null, content: string): SymbolEntry[] {
  if (!language) return [];
  const patterns = PATTERNS.filter((pattern) => pattern.language === language);
  if (!patterns.length) return [];
  const symbols: SymbolEntry[] = [];
  content.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    for (const pattern of patterns) {
      const match = line.match(pattern.expression);
      if (!match) continue;
      symbols.push({
        id: `${file}:${index + 1}:${match[1]}`, name: match[1], kind: pattern.kind,
        language, path: file, line: index + 1, signature: line.slice(0, 220),
      });
      break;
    }
  });
  return symbols;
}
