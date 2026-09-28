#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const MEOWAPPS_DIR = ".meowapps";
const TEMPLATES = new URL("../templates/", import.meta.url);
const { devDependencies } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);
const TOOLS = Object.fromEntries(
  Object.entries({ shopify: "@shopify/cli", firebase: "firebase-tools" }).map(
    ([cmd, name]) => [cmd, `${name}@${devDependencies[name]}`],
  ),
);

const HELP = `meowapps <command|tool> [args...]

Commands:
  init        Set up this project

Tools:
  shopify     Shopify CLI
  firebase    Firebase CLI

Examples:
  meowapps init
  meowapps shopify app dev
  meowapps shopify app deploy
  meowapps firebase deploy
  meowapps shopify --help
`;

const [tool, ...rest] = process.argv.slice(2);

if (!tool || tool === "--help" || tool === "-h") {
  console.log(HELP);
  process.exit(0);
}

if (tool !== "init" && !(tool in TOOLS)) {
  console.error(`meowapps: unknown tool '${tool}'\n\n${HELP}`);
  process.exit(1);
}

process.on("SIGINT", () => {});
process.on("SIGTERM", () => {});

const inDir = basename(process.cwd()) === MEOWAPPS_DIR;

if (!inDir) {
  copyDir(new URL(`${MEOWAPPS_DIR}/`, TEMPLATES), MEOWAPPS_DIR);
  mkdirSync(`${MEOWAPPS_DIR}/emulator-data`, { recursive: true });
  writeFileSync(
    `${MEOWAPPS_DIR}/.gitignore`,
    `# Ignore the entire ${MEOWAPPS_DIR} directory\n*\n`,
  );
}

if (tool === "init") {
  const code = await run("shopify", ["app", "config", "link"]);
  if (code === 0) copyDir(TEMPLATES, ".");
  process.exit(code);
}

process.exit(await run(tool, rest));

function run(cmd, args) {
  return new Promise((done) => {
    const child = spawn("npx", ["--yes", "--package", TOOLS[cmd], cmd, ...args], {
      stdio: "inherit",
      cwd: cmd === "firebase" && !inDir ? MEOWAPPS_DIR : ".",
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(new URL(`${e.name}/`, src), `${dest}/${e.name}`);
    else copyFileSync(new URL(e.name, src), `${dest}/${e.name}`);
  }
}
