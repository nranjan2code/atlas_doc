#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(productRoot, "package.json"), "utf8"));
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Atlas ${packageJson.version}\n\nUsage: atlas [project-directory] [options]\n\nOptions:\n  -p, --port <number>  Loopback port (default: 3010)\n      --production     Start a previously built production server\n  -h, --help           Show this help\n  -v, --version        Show the Atlas version`);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  console.log(packageJson.version);
  process.exit(0);
}

const positional = args.filter((argument, index) => !argument.startsWith("-") && args[index - 1] !== "--port" && args[index - 1] !== "-p");
const unknown = args.filter((argument) => argument.startsWith("-") && !["--production", "--port", "-p"].includes(argument));
if (unknown.length) {
  console.error(`Atlas: unknown option ${unknown[0]}. Run atlas --help for usage.`);
  process.exit(1);
}
if (positional.length > 1) {
  console.error("Atlas: provide at most one project directory.");
  process.exit(1);
}

const portFlag = Math.max(args.indexOf("--port"), args.indexOf("-p"));
const portValue = portFlag >= 0 ? args[portFlag + 1] : process.env.PORT ?? "3010";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`Atlas: invalid port ${portValue ?? "(missing)"}.`);
  process.exit(1);
}

const projectRoot = path.resolve(positional[0] ?? process.cwd());
if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
  console.error(`Atlas: project directory does not exist: ${projectRoot}`);
  process.exit(1);
}

const production = args.includes("--production");
const nextBin = path.join(productRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, production ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: productRoot,
  env: { ...process.env, ATLAS_PROJECT_ROOT: projectRoot },
  stdio: "inherit",
});

const relay = (signal) => { if (!child.killed) child.kill(signal); };
process.once("SIGINT", () => relay("SIGINT"));
process.once("SIGTERM", () => relay("SIGTERM"));
child.on("exit", (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code ?? 1));
