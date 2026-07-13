import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTests(absolute);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [absolute] : [];
  });
}

const binary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const result = spawnSync(binary, ["--test", ...collectTests(path.join(root, "src"))], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
