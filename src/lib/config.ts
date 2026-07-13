import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { AtlasConfig } from "./types";

const relativePattern = z.string().min(1).max(512).refine((value) =>
  !path.isAbsolute(value) && !/^[a-z]:[\\/]/i.test(value) && !/(^|[\\/])\.\.([\\/]|$)/.test(value),
  "Patterns must be relative and remain inside the project root.",
);

function luminance(rgb: number[]): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hasAccessibleAccent(value: string): boolean {
  const accent = value.match(/[0-9a-f]{2}/gi)?.map((part) => Number.parseInt(part, 16));
  if (!accent || accent.length !== 3) return false;
  // --accent-ink mixes the selected color with 45% black in the UI.
  const accentInk = accent.map((channel) => channel * 0.55);
  const paper = [244, 240, 231];
  const contrast = (luminance(paper) + 0.05) / (luminance(accentInk) + 0.05);
  return contrast >= 4.5;
}

const configSchema = z.object({
  workspace: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(600).optional(),
  }).optional(),
  project: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(600).optional(),
  }).optional(),
  source: z.object({
    include: z.array(relativePattern).max(100).optional(),
    exclude: z.array(relativePattern).max(500).optional(),
    maxFileBytes: z.number().int().positive().max(2_000_000).optional(),
    maxFiles: z.number().int().positive().max(50_000).optional(),
    maxTotalBytes: z.number().int().positive().max(500_000_000).optional(),
  }).optional(),
  content: z.object({
    include: z.array(relativePattern).max(100).optional(),
    exclude: z.array(relativePattern).max(500).optional(),
    maxFileBytes: z.number().int().positive().max(2_000_000).optional(),
    maxFiles: z.number().int().positive().max(50_000).optional(),
    maxTotalBytes: z.number().int().positive().max(500_000_000).optional(),
  }).optional(),
  authority: z.array(z.object({
    match: relativePattern, rank: z.number().finite().min(-1_000).max(1_000), label: z.string().max(120).optional(),
    canonical: z.boolean().optional(), historical: z.boolean().optional(),
  })).max(200).optional(),
  portal: z.object({
    accent: z.string().regex(/^#[0-9a-f]{6}$/i).refine(hasAccessibleAccent, "Accent must maintain 4.5:1 contrast for interface text.").optional(),
    profile: z.enum(["auto", "code", "general"]).optional(),
  }).optional(),
});

const MAX_CONFIG_BYTES = 256_000;

const DEFAULT_EXCLUDES = [
  "**/.git/**", "**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**",
  "**/target/**", "**/out/**", "**/coverage/**", "**/.venv/**", "**/venv/**",
  "**/vendor/**", "**/.idea/**", "**/.vscode/**", "**/.env*", "**/*secret*", "**/*credential*",
];

export function loadConfig(root: string): AtlasConfig {
  const configPath = ["atlas.yaml", "atlas.yml"].map((file) => path.join(root, file)).find(existsSync);
  if (configPath) {
    const stats = lstatSync(configPath);
    if (stats.isSymbolicLink()) throw new Error("Atlas configuration must not be a symbolic link.");
    if (stats.size > MAX_CONFIG_BYTES) throw new Error(`Atlas configuration exceeds ${MAX_CONFIG_BYTES.toLocaleString()} bytes.`);
  }
  const raw = configPath ? configSchema.parse(parse(readFileSync(configPath, "utf8"))) : {};
  const workspace = raw.workspace ?? raw.project;
  const content = raw.content ?? raw.source;
  return {
    project: {
      name: workspace?.name ?? path.basename(root),
      description: workspace?.description ?? "A live, source-linked map of this workspace.",
    },
    source: {
      include: content?.include ?? ["**/*"],
      exclude: [...DEFAULT_EXCLUDES, ...(content?.exclude ?? [])],
      maxFileBytes: content?.maxFileBytes ?? 1_000_000,
      maxFiles: content?.maxFiles ?? 25_000,
      maxTotalBytes: content?.maxTotalBytes ?? 250_000_000,
    },
    authority: raw.authority ?? [
      { match: "AGENTS.md", rank: 100, label: "Workspace contract", canonical: true },
      { match: "README.md", rank: 80, label: "Workspace guide", canonical: true },
      { match: "docs/**", rank: 50, label: "Documentation" },
    ],
    portal: { accent: raw.portal?.accent ?? "#d99a3d", profile: raw.portal?.profile ?? "auto" },
  };
}
