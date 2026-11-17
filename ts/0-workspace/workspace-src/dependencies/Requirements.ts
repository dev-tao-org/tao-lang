import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as SourceValidation from '@source-validation'

import { Errors, Sort } from '@shared'
import { FS, Path } from '@shared/os'
import { deriveDefaultSourceAlias } from './Sources'
import type { DependencyRequirement } from './Types'

/** readProjectRequirements extracts cached direct project source requirements. */
export async function readProjectRequirements(projectRoot: string): Promise<DependencyRequirement[]> {
  const paths = (await FS.readdir(projectRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.tao'))
    .map(entry => Path.join(projectRoot, entry.name))
    .sort(Sort.CompareStrings)
  const requirements = (await Promise.all(paths.map(async path => {
    return readRequirementsFromSource(await FS.readFile(path, 'utf8'), path)
  }))).flat()
  validateSourceRequirements(requirements)
  return requirements
}

/** validateRequirementPlacement rejects project dependency declarations inside source modules. */
export function validateRequirementPlacement(
  document: AST.Document,
  sourcePath: string,
  projectRoot: string,
): void {
  if (Path.dirname(Path.resolve(sourcePath)) === Path.resolve(projectRoot)) {
    return
  }
  if (AST.GetDeclarations(document).some(isSourceRequirement)) {
    Errors.ThrowUserInput(`Source requirement declarations belong in project-root Tao files: ${sourcePath}.`)
  }
}

/** collectSourceRequirements reads complete declarations already parsed by module resolution. */
export function collectSourceRequirements(document: AST.Document, path: string): DependencyRequirement[] {
  return AST.GetDeclarations(document)
    .filter(isSourceRequirement)
    .map(declaration => requirementFromDeclaration(declaration, path))
}

/** validateSourceRequirements rejects duplicate aliases and overrides of the bundled Tao project. */
export function validateSourceRequirements(requirements: DependencyRequirement[]): void {
  const aliases = new Set<string>()
  for (const requirement of requirements) {
    const alias = requirement.alias ?? deriveDefaultSourceAlias(requirement)
    if (alias === 'tao' && (requirement.provider !== 'bundled' || requirement.identifier !== 'tao')) {
      Errors.ThrowUserInput('Dependency alias tao belongs to the bundled Tao project. Choose another alias with as.')
    }
    if (aliases.has(alias)) {
      Errors.ThrowUserInput(`Dependency alias ${alias} is declared more than once.`)
    }
    aliases.add(alias)
  }
}

function readRequirementsFromSource(source: string, path: string): DependencyRequirement[] {
  const cached = parsedFiles.get(path)
  if (cached?.source === source) {
    return cached.requirements
  }
  const document = AST.transform(parser.parse(source))
  if (!document) {
    Errors.ThrowUserInput(`Cannot read requirements from invalid Tao source: ${path}.`)
  }
  SourceValidation.assertValidRequirements(document, path)
  const requirements = AST.GetDeclarations(document)
    .filter(isSourceRequirement)
    .map(declaration => requirementFromDeclaration(declaration, path))
  parsedFiles.set(path, { source, requirements })
  return requirements
}

function isSourceRequirement(
  declaration: AST.Declaration,
): declaration is Extract<AST.Declaration, { kind: 'RequiresDeclaration' }> {
  return declaration.kind === 'RequiresDeclaration' && declaration.provider !== 'npm'
}

function requirementFromDeclaration(
  declaration: Extract<import('@ast-gen').Declaration, { kind: 'RequiresDeclaration' }>,
  path: string,
): DependencyRequirement {
  const provider = declaration.provider
  if (provider === 'npm') {
    Errors.ThrowShouldNeverHappen('npm requirements belong to the sidecar resolver.')
  }
  if (provider === 'github' && !declaration.version) {
    Errors.ThrowUserInput(`GitHub requirement ${declaration.identifier} in ${path} needs a version.`)
  }
  const version = provider === 'github' ? declaration.version! : declaration.version ?? getDefaultVersion(provider)
  if (declaration.alias) {
    SourceValidation.requireValidDeclarationName(declaration.alias, path)
  }
  const aliasFields = declaration.alias ? { alias: declaration.alias.value } : {}
  return {
    provider,
    identifier: declaration.identifier,
    version,
    ...aliasFields,
  }
}

function getDefaultVersion(provider: Exclude<DependencyRequirement['provider'], 'github'>): string {
  return provider === 'file' ? 'live' : 'bundled'
}

const parser = Grammar.createParser()
const parsedFiles = new Map<string, { source: string; requirements: DependencyRequirement[] }>()
