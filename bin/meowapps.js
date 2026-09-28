#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = ".meowapps";
const TEMPLATES = new URL("../templates/", import.meta.url);
const DOCS = new URL("../docs/", import.meta.url);
const { devDependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const pkg = (name) => `${name}@${devDependencies[name]}`;
const TOOLS = { shopify: pkg("@shopify/cli"), firebase: pkg("firebase-tools") };
const inDir = basename(process.cwd()) === DIR;
const at = (file) => `${DIR}/${file}`;

process.exit(await main(process.argv.slice(2)));

async function main([tool, ...args]) {
  if (!tool || tool === "--help" || tool === "-h") {
    console.log(help());
    return 0;
  }
  if (tool !== "init" && !Object.hasOwn(TOOLS, tool)) {
    console.error(`meowapps: unknown tool '${tool}'\n\n${help()}`);
    return 1;
  }
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  if (!inDir) prepareDir();
  if (tool === "init") {
    const code = await run("shopify", ["app", "config", "link"]);
    if (code === 0) copyDir(TEMPLATES, ".");
    return code;
  }
  const code = await run(tool, args);
  if (tool === "firebase" && !inDir && existsSync(at(".firebaserc"))) copyFileSync(at(".firebaserc"), ".firebaserc");
  return code;
}

function help() {
  const docs = readdirSync(DOCS).map((file) => {
    const url = new URL(file, DOCS);
    const description = readFileSync(url, "utf8").match(/^description: (.*)$/m)[1];
    return `  ${relative(process.cwd(), fileURLToPath(url))}\n    ${description}`;
  });
  return `meowapps <command|tool> [args...]

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
${docs.join("\n")}
`;
}

function prepareDir() {
  copyDir(new URL(`${DIR}/`, TEMPLATES), DIR);
  mkdirSync(at("emulator-data"), { recursive: true });
  writeFileSync(at(".gitignore"), `# Ignore the entire ${DIR} directory\n*\n`);
  const cwd = JSON.stringify(`${process.cwd()}/`).slice(0, -1);
  writeFileSync(at("firebase.json"), readFileSync(at("firebase.json"), "utf8").replaceAll('"../', cwd));
  if (existsSync(".firebaserc")) copyFileSync(".firebaserc", at(".firebaserc"));
  else rmSync(at(".firebaserc"), { force: true });
}

function run(cmd, args) {
  return new Promise((done) => {
    const cwd = cmd === "firebase" && !inDir ? DIR : ".";
    spawn("npx", ["--yes", "--package", TOOLS[cmd], cmd, ...args], { stdio: "inherit", cwd })
      .on("close", (code) => done(code ?? 1));
  });
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(new URL(`${e.name}/`, src), `${dest}/${e.name}`);
    else copyFileSync(new URL(e.name, src), `${dest}/${e.name}`);
  }
}
