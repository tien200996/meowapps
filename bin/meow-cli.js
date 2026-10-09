#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access, cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

class MeowCli {
  static #helpFlags = ['--help', '-h']
  static #toolPackages = { shopify: '@shopify/cli', firebase: 'firebase-tools' }
  static #ignoredSignals = ['SIGINT', 'SIGTERM']
  static #docsFolder = fileURLToPath(new URL('../docs/', import.meta.url))
  static #docSuffix = '.md'
  static #descriptionPattern = /^description: (.*)$/m
  static #upwardPrefix = '..'
  static #missingDescription = 'No description: add one to the frontmatter of this doc'
  static #usageText = `Usage: npx meowapps <command|tool> [args...]

Commands:
  init
    Link a Shopify app, and copy the template into a new folder

Tools:
  shopify app dev
    Run the app on a dev store with the Firebase emulators
  shopify app deploy
    Release the app config and extensions to Shopify
  firebase deploy
    Deploy functions, hosting and Firestore rules to Firebase
  shopify app [args...]
    Run any other Shopify app command, see shopify app --help
  firebase [args...]
    Run any other Firebase CLI command, see firebase --help

Docs:
`
  static #workFolder = '.meowapps'
  static #templateFolder = fileURLToPath(new URL('../templates/', import.meta.url))
  static #nestedFlag = basename(process.cwd()) === MeowCli.#workFolder
  static #workPath = MeowCli.#nestedFlag ? process.cwd() : resolve(MeowCli.#workFolder)
  static #sourcePath = join(MeowCli.#templateFolder, MeowCli.#workFolder)
  static #sourceFlag = MeowCli.#workPath === MeowCli.#sourcePath
  static #ignoreFile = '.gitignore'
  static #ignoreText = '# Ignore the entire .meowapps directory\n*\n'
  static #emulatorFolder = 'emulator-data'
  static #projectFile = '.firebaserc'
  static #publicFolder = 'public'
  static #appFolder = join(MeowCli.#publicFolder, 'meowapps')
  static #appPath = join(MeowCli.#appFolder, 'meow-app.js')
  static #appSource = join(MeowCli.#templateFolder, MeowCli.#appPath)
  static #appIgnore = '# meowapps writes this folder on every run\n*\n'
  static #markerFile = join('functions', 'package.json')
  static #dependencyName = 'meowapps'
  static #linkArgs = ['app', 'config', 'link']
  static #emulatorPrefix = 'emulators:'
  static #configFile = 'firebase.json'
  static #parentPrefix = '"../'
  static #packageFile = fileURLToPath(new URL('../package.json', import.meta.url))

  static {
    MeowCli.runCommand(process.argv.slice(2))
  }

  static async runCommand([commandName, ...commandArgs]) {
    try {
      process.exitCode = await MeowCli.#chooseCommand(commandName, commandArgs)
    } catch (commandError) {
      process.stderr.write(`meowapps: ${commandError.message}\n`)
      process.exitCode = 1
    }
  }

  static async #chooseCommand(commandName, commandArgs) {
    if (!commandName || MeowCli.#helpFlags.includes(commandName)) {
      process.stdout.write(`${await MeowCli.#buildHelp()}\n`)
      return 0
    }
    if (commandName !== 'init' && !Object.hasOwn(MeowCli.#toolPackages, commandName)) {
      throw new Error(`unknown tool '${commandName}'\n\n${await MeowCli.#buildHelp()}`)
    }
    for (const signalName of MeowCli.#ignoredSignals) process.on(signalName, () => {})
    if (!MeowCli.#nestedFlag) await MeowCli.#prepareFolder()
    if (commandName === 'init') return MeowCli.#initApp()
    if (commandName === 'firebase') await MeowCli.#writeConfig(commandArgs)
    const exitCode = await MeowCli.#runTool(commandName, commandArgs)
    if (commandName === 'firebase' && !MeowCli.#nestedFlag) await MeowCli.#saveProject()
    return exitCode
  }

  static async #buildHelp() {
    const docFiles = (await readdir(MeowCli.#docsFolder)).filter(docFile => docFile.endsWith(MeowCli.#docSuffix)).sort()
    const docLines = await Promise.all(docFiles.map(async docFile => {
      const docPath = join(MeowCli.#docsFolder, docFile)
      const descriptionMatch = MeowCli.#descriptionPattern.exec(await readFile(docPath, 'utf8'))
      const relativePath = relative(process.cwd(), docPath)
      const shownPath = relativePath.startsWith(MeowCli.#upwardPrefix) ? docPath : relativePath
      return `  ${shownPath}\n    ${descriptionMatch?.[1] ?? MeowCli.#missingDescription}`
    }))
    return `${MeowCli.#usageText}${docLines.join('\n')}\n`
  }

  static async #prepareFolder() {
    if (!MeowCli.#sourceFlag) {
      await MeowCli.#copyFolder(MeowCli.#sourcePath, MeowCli.#workFolder)
      await MeowCli.#replaceFile(join(MeowCli.#workFolder, MeowCli.#ignoreFile), MeowCli.#ignoreText)
      await MeowCli.#writeApp()
    }
    await mkdir(join(MeowCli.#workFolder, MeowCli.#emulatorFolder), { recursive: true })
    await MeowCli.#loadProject()
  }

  static async #initApp() {
    if (await MeowCli.#findApp()) return MeowCli.#runTool('shopify', MeowCli.#linkArgs)
    const existingFiles = await MeowCli.#filterExisting(await MeowCli.#listTemplates())
    if (existingFiles.length) throw new Error(`init would overwrite ${existingFiles.join(', ')}; move them away and run init again`)
    const exitCode = await MeowCli.#runTool('shopify', MeowCli.#linkArgs)
    if (exitCode === 0) {
      await cp(MeowCli.#templateFolder, '.', { recursive: true, force: false, filter: MeowCli.#keepSource })
      await MeowCli.#writeApp()
    }
    return exitCode
  }

  static async #writeConfig([firebaseCommand = '']) {
    const emulatorFlag = firebaseCommand.startsWith(MeowCli.#emulatorPrefix)
    if (MeowCli.#sourceFlag && !emulatorFlag) {
      throw new Error(`firebase ${firebaseCommand} would overwrite the template config; run it in an app folder`)
    }
    if (MeowCli.#sourceFlag) return
    const templateText = await readFile(join(MeowCli.#sourcePath, MeowCli.#configFile), 'utf8')
    const rootPrefix = JSON.stringify(`${dirname(MeowCli.#workPath)}/`).slice(0, -1)
    const configText = emulatorFlag ? templateText : templateText.replaceAll(MeowCli.#parentPrefix, rootPrefix)
    await MeowCli.#replaceFile(join(MeowCli.#workPath, MeowCli.#configFile), configText)
  }

  static async #saveProject() {
    const workProject = join(MeowCli.#workFolder, MeowCli.#projectFile)
    if (await MeowCli.#findFile(workProject)) await MeowCli.#replaceFile(MeowCli.#projectFile, await readFile(workProject))
  }

  static async #copyFolder(sourceFolder, targetFolder) {
    const sourceEntries = await readdir(sourceFolder, { recursive: true, withFileTypes: true })
    await Promise.all(sourceEntries.map(async sourceEntry => {
      const entryPath = join(sourceEntry.parentPath, sourceEntry.name)
      const targetPath = join(targetFolder, relative(sourceFolder, entryPath))
      if (sourceEntry.isDirectory()) await mkdir(targetPath, { recursive: true })
      else await MeowCli.#replaceFile(targetPath, await readFile(entryPath))
    }))
  }

  static async #loadProject() {
    const workProject = join(MeowCli.#workFolder, MeowCli.#projectFile)
    if (await MeowCli.#findFile(MeowCli.#projectFile)) await MeowCli.#replaceFile(workProject, await readFile(MeowCli.#projectFile))
    else await rm(workProject, { force: true })
  }

  static async #findApp() {
    if (!await MeowCli.#findFile(MeowCli.#markerFile)) return false
    const { dependencies } = JSON.parse(await readFile(MeowCli.#markerFile, 'utf8'))
    return Object.hasOwn(dependencies ?? {}, MeowCli.#dependencyName)
  }

  static async #filterExisting(templateFiles) {
    const existFlags = await Promise.all(templateFiles.map(MeowCli.#findFile))
    return templateFiles.filter((templateFile, fileIndex) => existFlags[fileIndex])
  }

  static async #listTemplates() {
    const templateEntries = await readdir(MeowCli.#templateFolder, { recursive: true, withFileTypes: true })
    return templateEntries
      .filter(templateEntry => templateEntry.isFile())
      .map(templateEntry => relative(MeowCli.#templateFolder, join(templateEntry.parentPath, templateEntry.name)))
      .filter(templatePath => templatePath.split(sep)[0] !== MeowCli.#workFolder && templatePath !== MeowCli.#appPath)
  }

  static #keepSource(sourcePath) {
    return sourcePath !== MeowCli.#sourcePath && sourcePath !== MeowCli.#appSource
  }

  static async #runTool(toolName, toolArgs) {
    const toolPackage = await MeowCli.#pinPackage(toolName)
    const toolFolder = toolName === 'firebase' && !MeowCli.#nestedFlag ? MeowCli.#workFolder : '.'
    return new Promise((finishRun, failRun) => {
      spawn('npx', ['--yes', '--package', toolPackage, toolName, ...toolArgs], { stdio: 'inherit', cwd: toolFolder })
        .on('error', spawnError => failRun(new Error(`could not start npx: ${spawnError.message}`)))
        .on('close', exitCode => finishRun(exitCode ?? 1))
    })
  }

  static async #pinPackage(toolName) {
    const { devDependencies } = JSON.parse(await readFile(MeowCli.#packageFile, 'utf8'))
    const packageName = MeowCli.#toolPackages[toolName]
    return `${packageName}@${devDependencies[packageName]}`
  }

  static async #replaceFile(targetFile, fileContent) {
    const draftFile = `${targetFile}.${process.pid}`
    await mkdir(dirname(targetFile), { recursive: true })
    await writeFile(draftFile, fileContent)
    await rename(draftFile, targetFile)
  }

  static async #writeApp() {
    if (!await MeowCli.#findFile(MeowCli.#publicFolder)) return
    await MeowCli.#replaceFile(MeowCli.#appPath, await readFile(MeowCli.#appSource))
    await MeowCli.#replaceFile(join(MeowCli.#appFolder, MeowCli.#ignoreFile), MeowCli.#appIgnore)
  }

  static #findFile(filePath) {
    return access(filePath).then(() => true, () => false)
  }
}
