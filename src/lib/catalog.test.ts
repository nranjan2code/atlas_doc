import assert from "node:assert/strict";
import test from "node:test";
import { extractSymbols } from "./symbols";

test("extracts symbols from multiple languages", () => {
  assert.equal(extractSymbols("a.ts", "TypeScript", "export function start() {}").at(0)?.name, "start");
  assert.equal(extractSymbols("a.py", "Python", "class Portal:\n    pass").at(0)?.name, "Portal");
  assert.equal(extractSymbols("a.rs", "Rust", "pub struct Index {}").at(0)?.name, "Index");
  assert.equal(extractSymbols("a.go", "Go", "func Build() {}").at(0)?.name, "Build");
});

test("does not expose private Go symbols", () => {
  assert.equal(extractSymbols("a.go", "Go", "func build() {}").length, 0);
});
