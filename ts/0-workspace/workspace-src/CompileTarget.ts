import * as AST from '@ast-gen'
import * as Grammar from '@grammar'

import { Errors } from '@shared'
import { FS, Path } from '@shared/os'
import { readTypeScriptProjectPackage } from './TypeScriptProjectPackage'

/** CompileTarget identifies one selected declaration and its package name when applicable. */
export type CompileTarget = {
  kind: CompileTargetKind
  entry: string
  target?: string
  name?: string
}

type CompileTargetKind = 'app' | 'library'

/** resolveCompileTarget resolves an explicit entry or a package-configured declaration by name. */
export async function resolveCompileTarget(directory: string, argument?: string): Promise<CompileTarget> {
  const explicit = argument ? Path.resolve(directory, argument) : undefined
  const isEntry = explicit !== undefined && FS.existsSync(explicit)
  const configuration = isEntry ? { entry: explicit } : await requireCompileConfiguration(directory)
  const entry = Path.resolve(directory, configuration.entry)
  const selected = isEntry ? undefined : argument
  const document = await readCompileDocument(entry)
  const declarations = [
    ...AST.GetAppDeclarations(document),
    ...AST.GetTypeScriptLibraryDeclarations(document),
  ]
  const matches = declarations.filter(node => selected === undefined || node.name.value === selected)
  if (matches.length !== 1) {
    Errors.ThrowUserInput(`Select one Tao app or ts-library in ${entry}; found ${matches.length} matching targets.`)
  }
  const declaration = matches[0]!
  return {
    kind: declaration.kind === 'TypeScriptLibraryDeclaration' ? 'library' : 'app',
    entry,
    target: declaration.name.value,
    name: configuration.name,
  }
}

/** resolveLibraryCompileTarget selects a named library from an explicit entry or authored package settings. */
export async function resolveLibraryCompileTarget(
  directory: string,
  library: string,
  explicitEntry?: string,
): Promise<CompileTarget> {
  const configuration = explicitEntry === undefined
    ? await requireCompileConfiguration(directory)
    : await readOptionalCompileConfiguration(directory)
  const entry = explicitEntry ?? Path.resolve(directory, configuration!.entry)
  const document = await readCompileDocument(entry)
  if (AST.GetTypeScriptLibraryDeclarations(document, library).length !== 1) {
    Errors.ThrowUserInput(`Select one ts-library named ${library} in ${entry}.`)
  }
  const name = configuration?.name ?? library.toLowerCase()
  return { kind: 'library', entry, target: library, name }
}

async function readCompileDocument(entry: string): Promise<AST.Document> {
  const document = AST.transform(Grammar.createParser().parse(await FS.readFile(entry, 'utf8')))
  return document ?? Errors.ThrowUserInput(`Invalid Tao source: ${entry}.`)
}

async function requireCompileConfiguration(directory: string) {
  const manifest = await readTypeScriptProjectPackage(directory)
  return manifest.compile ?? Errors.ThrowUserInput('Configure tao.compile in the authored package.json.')
}

async function readOptionalCompileConfiguration(directory: string) {
  if (FS.existsSync(Path.join(directory, 'package.json'))) {
    return (await readTypeScriptProjectPackage(directory)).compile
  }
}
