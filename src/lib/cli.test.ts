import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const cli = path.resolve("scripts/atlas.mjs");

test("CLI exposes help and validates ports without starting a server", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: atlas/);
  assert.match(help.stdout, /--port/);
  const invalid = spawnSync(process.execPath, [cli, "--port", "70000"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /invalid port/);
});
