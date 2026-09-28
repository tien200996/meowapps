#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MEOWAPPS_DIR = ".meowapps";
const TEMPLATES = new URL("../templates/", import.meta.url);
const DOCS = new URL("../docs/", import.meta.url);
const { devDependencies } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);
const TOOLS = Object.fromEntries(
  Object.entries({ shopify: "@shopify/cli", firebase: "firebase-tools" }).map(
    ([cmd, name]) => [cmd, `${name}@${devDependencies[name]}`],
  ),
);
const DOC_LIST = readdirSync(DOCS).map((file) => ({
  path: relative(process.cwd(), fileURLToPath(new URL(file, DOCS))),
  description: readFileSync(new URL(file, DOCS), "utf8").match(/^description: (.*)$/m)[1],
}));

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

Docs:
${DOC_LIST.map(({ path, description }) => `  ${path}\n    ${description}`).join("\n")}
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

if (!inDir) prepareMeowappsDir();

if (tool === "init") {
  const code = await run("shopify", ["app", "config", "link"]);
  if (code === 0) copyDir(TEMPLATES, ".");
  process.exit(code);
}

const code = await run(tool, rest);
if (tool === "firebase" && !inDir) keepFirebaserc();
process.exit(code);

function prepareMeowappsDir() {
  copyDir(new URL(`${MEOWAPPS_DIR}/`, TEMPLATES), MEOWAPPS_DIR);
  mkdirSync(`${MEOWAPPS_DIR}/emulator-data`, { recursive: true });
  writeFileSync(
    `${MEOWAPPS_DIR}/.gitignore`,
    `# Ignore the entire ${MEOWAPPS_DIR} directory\n*\n`,
  );
  writeFileSync(
    `${MEOWAPPS_DIR}/firebase.json`,
    readFileSync(`${MEOWAPPS_DIR}/firebase.json`, "utf8").replaceAll(
      '"../',
      JSON.stringify(`${process.cwd()}/`).slice(0, -1),
    ),
  );
  if (existsSync(".firebaserc")) copyFileSync(".firebaserc", `${MEOWAPPS_DIR}/.firebaserc`);
  else rmSync(`${MEOWAPPS_DIR}/.firebaserc`, { force: true });
}

function run(cmd, args) {
  return new Promise((done) => {
    const child = spawn("npx", ["--yes", "--package", TOOLS[cmd], cmd, ...args], {
      stdio: "inherit",
      cwd: cmd === "firebase" && !inDir ? MEOWAPPS_DIR : ".",
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

function keepFirebaserc() {
  if (existsSync(`${MEOWAPPS_DIR}/.firebaserc`)) {
    copyFileSync(`${MEOWAPPS_DIR}/.firebaserc`, ".firebaserc");
  }
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(new URL(`${e.name}/`, src), `${dest}/${e.name}`);
    else copyFileSync(new URL(e.name, src), `${dest}/${e.name}`);
  }
}
