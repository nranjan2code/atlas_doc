import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config";

test("validates portal colors and applies bounded defaults", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "atlas-config-"));
  try {
    writeFileSync(path.join(root, "atlas.yaml"), "project:\n  name: Fixture\nportal:\n  accent: '#336699'\n");
    const config = loadConfig(root);
    assert.equal(config.project.name, "Fixture");
    assert.equal(config.portal.accent, "#336699");
    assert.equal(config.source.maxFiles, 25_000);
    writeFileSync(path.join(root, "atlas.yaml"), "portal:\n  accent: red\n");
    assert.throws(() => loadConfig(root));
    writeFileSync(path.join(root, "atlas.yaml"), "source:\n  include: ['../**']\n");
    assert.throws(() => loadConfig(root), /Patterns must be relative/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects oversized configuration before parsing", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "atlas-config-large-"));
  try {
    writeFileSync(path.join(root, "atlas.yaml"), `#${"x".repeat(256_100)}`);
    assert.throws(() => loadConfig(root), /exceeds/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
