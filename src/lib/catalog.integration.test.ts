import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { getSnapshot, search, toPortalSnapshot } from "./catalog";

test("search supports field filters and symbol line matches", () => {
  const snapshot = getSnapshot();
  const typescript = search("language:TypeScript", 100);
  assert.ok(typescript.length > 0);
  assert.ok(typescript.every((hit) => hit.entry.language === "TypeScript"));
  const tests = search("kind:test", 100);
  assert.ok(tests.length > 0);
  assert.ok(tests.every((hit) => hit.entry.kind === "test"));
  const symbol = search("getPortalSnapshot", 20).find((hit) => hit.symbol === "getPortalSnapshot");
  assert.ok(symbol?.line && symbol.line > 0);
  const compact = toPortalSnapshot(snapshot);
  assert.ok(compact.entries.length <= 32);
  assert.equal("excerpt" in compact.entries[0], false);
});

test("indexing honors repository ignores, blocks common secrets, disables Git fsmonitor, and refuses swapped symlinks", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "atlas-security-"));
  const outside = path.join(root, "..", `${path.basename(root)}-outside.txt`);
  try {
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "README.md"), "# Fixture\n\nSafe fixture.\n");
    writeFileSync(path.join(root, "src", "visible.ts"), `export function visible() { return true; }\n${" ".repeat(3_000)}// deepneedle\n`);
    writeFileSync(path.join(root, "ignored.ts"), "export const ignored = true;\n");
    writeFileSync(path.join(root, "Secret.yaml"), "token: should-not-be-indexed\n");
    writeFileSync(path.join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { exposed: "echo should-not-be-read" } }));
    writeFileSync(path.join(root, "atlas.yaml"), "portal:\n  accent: '#112233'\n");
    writeFileSync(path.join(root, ".gitignore"), "ignored.ts\npackage.json\natlas.yaml\n");
    writeFileSync(outside, "outside secret\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    const marker = path.join(root, "fsmonitor-ran");
    const monitor = path.join(root, "fsmonitor.sh");
    writeFileSync(monitor, `#!/bin/sh\ntouch "${marker}"\nexit 0\n`);
    chmodSync(monitor, 0o755);
    execFileSync("git", ["config", "core.fsmonitor", monitor], { cwd: root });

    const catalogUrl = pathToFileURL(path.resolve("src/lib/catalog.ts")).href;
    const sourcePath = JSON.stringify(path.join(root, "src", "visible.ts"));
    const outsidePath = JSON.stringify(outside);
    const script = `
      import { unlinkSync, symlinkSync, writeFileSync } from "node:fs";
      import { getSnapshot, readAsset, readSource, search } from ${JSON.stringify(catalogUrl)};
      (async () => {
      const snapshot = getSnapshot();
      const asset = readAsset("logo.png");
      writeFileSync(${JSON.stringify(path.join(root, "atlas.yaml"))}, "portal:\\n  accent: '#445566'\\n");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const refreshed = getSnapshot();
      unlinkSync(${sourcePath});
      symlinkSync(${outsidePath}, ${sourcePath});
      const swappedRead = readSource("src/visible.ts");
      console.log(JSON.stringify({ paths: snapshot.entries.map((entry) => entry.path), git: snapshot.git, snapshotContentRetained: swappedRead?.content.includes("deepneedle") ?? false, commands: snapshot.facts.commands, accentBefore: snapshot.portal.accent, accentAfter: refreshed.portal.accent, assetBytes: asset?.content.length ?? 0, deepSearch: search("deepneedle").some((hit) => hit.entry.path === "src/visible.ts") }));
      })();
    `;
    const execution = spawnSync(path.resolve("node_modules/.bin/tsx"), ["--eval", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ATLAS_PROJECT_ROOT: root, ATLAS_SCAN_INTERVAL_MS: "250" },
    });
    assert.equal(execution.status, 0, execution.stderr);
    const payload = JSON.parse(execution.stdout.trim().split("\n").at(-1) ?? "{}") as { paths: string[]; git: { available: boolean }; snapshotContentRetained: boolean; commands: unknown[]; accentBefore: string; accentAfter: string; assetBytes: number; deepSearch: boolean };
    assert.ok(payload.paths.includes("README.md"));
    assert.ok(payload.paths.includes("src/visible.ts"));
    assert.ok(!payload.paths.includes("ignored.ts"));
    assert.ok(!payload.paths.includes("Secret.yaml"));
    assert.ok(payload.paths.includes("logo.png"));
    assert.equal(payload.git.available, true);
    assert.equal(payload.snapshotContentRetained, true);
    assert.deepEqual(payload.commands, []);
    assert.equal(payload.accentBefore, "#112233");
    assert.equal(payload.accentAfter, "#445566");
    assert.equal(payload.assetBytes, 8);
    assert.equal(payload.deepSearch, true);
    assert.throws(() => readFileSync(marker));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { force: true });
  }
});

test("indexing fails closed when ignore-rule safety limits are exceeded", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "atlas-ignore-limit-"));
  try {
    writeFileSync(path.join(root, "README.md"), "# Fixture\n");
    for (let index = 0; index < 251; index += 1) {
      const directory = path.join(root, `d${index}`);
      mkdirSync(directory);
      writeFileSync(path.join(directory, ".gitignore"), "private.txt\n");
    }
    const catalogUrl = pathToFileURL(path.resolve("src/lib/catalog.ts")).href;
    const execution = spawnSync(path.resolve("node_modules/.bin/tsx"), ["--eval", `import { getSnapshot } from ${JSON.stringify(catalogUrl)}; getSnapshot();`], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ATLAS_PROJECT_ROOT: root },
    });
    assert.notEqual(execution.status, 0);
    assert.match(execution.stderr, /more than 250 \.gitignore files/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("indexes non-code workspace formats and the full admitted media set", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "atlas-general-workspace-"));
  try {
    const textFixtures: Record<string, string> = {
      "README.md": "# Workspace\n",
      "research.txt": "Interview notes\n",
      "records.csv": "name,status\nAtlas,active\n",
      "policy.rst": "Policy\n======\n",
      "runbook.adoc": "= Runbook\n",
      "infrastructure.tf": "resource \"example\" \"main\" {}\n",
      "schema.graphql": "type Query { status: String! }\n",
      "notebook.ipynb": "{\"cells\":[],\"nbformat\":4}",
    };
    for (const [file, content] of Object.entries(textFixtures)) writeFileSync(path.join(root, file), content);
    writeFileSync(path.join(root, "diagram.bmp"), Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]));
    writeFileSync(path.join(root, "diagram.avif"), Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]));
    const catalogUrl = pathToFileURL(path.resolve("src/lib/catalog.ts")).href;
    const execution = spawnSync(path.resolve("node_modules/.bin/tsx"), ["--eval", `import { getSnapshot } from ${JSON.stringify(catalogUrl)}; console.log(JSON.stringify(getSnapshot()));`], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ATLAS_PROJECT_ROOT: root },
    });
    assert.equal(execution.status, 0, execution.stderr);
    const snapshot = JSON.parse(execution.stdout.trim()) as { profile: string; entries: Array<{ path: string; kind: string }> };
    assert.equal(snapshot.profile, "general");
    const paths = new Set(snapshot.entries.map((entry) => entry.path));
    for (const file of [...Object.keys(textFixtures), "diagram.bmp", "diagram.avif"]) assert.ok(paths.has(file), `${file} should be indexed`);
    assert.equal(snapshot.entries.find((entry) => entry.path === "diagram.avif")?.kind, "asset");
    assert.equal(snapshot.entries.find((entry) => entry.path === "diagram.bmp")?.kind, "asset");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("serves immutable snapshot bytes after an intermediate directory swap", () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "atlas-parent-symlink-"));
  const root = path.join(parent, "root");
  const outside = path.join(parent, "outside");
  try {
    mkdirSync(path.join(root, "docs"), { recursive: true });
    mkdirSync(outside);
    writeFileSync(path.join(root, "README.md"), "# Fixture\n");
    writeFileSync(path.join(root, "docs", "record.md"), "inside snapshot\n");
    writeFileSync(path.join(outside, "record.md"), "outside content\n");
    const catalogUrl = pathToFileURL(path.resolve("src/lib/catalog.ts")).href;
    const script = `
      import { rmSync, symlinkSync } from "node:fs";
      import { getSnapshot, readSource } from ${JSON.stringify(catalogUrl)};
      getSnapshot();
      rmSync(${JSON.stringify(path.join(root, "docs"))}, { recursive: true });
      symlinkSync(${JSON.stringify(outside)}, ${JSON.stringify(path.join(root, "docs"))}, "dir");
      console.log(JSON.stringify(readSource("docs/record.md")?.content));
    `;
    const execution = spawnSync(path.resolve("node_modules/.bin/tsx"), ["--eval", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ATLAS_PROJECT_ROOT: root },
    });
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(JSON.parse(execution.stdout.trim()), "inside snapshot\n");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
