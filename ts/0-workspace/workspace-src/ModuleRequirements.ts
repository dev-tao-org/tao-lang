import type * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors } from '@shared'
import { FileSystem } from '@shared/os'
import { valid } from 'semver'
import { validateRequirementPlacement } from './dependencies/Requirements'
import { recursiveSourceFiles } from './modules/Catalog'
import type { ManagedModuleRequirement } from './sidecars/ManagedModules'

/** readModuleRequirements collects npm declarations across one selected module's Tao files. */
export async function readModuleRequirements(
  moduleRoot: string,
  projectRoot: string,
): Promise<ManagedModuleRequirement[]> {
  const paths = await recursiveSourceFiles(moduleRoot, moduleRoot, projectRoot)
  const requirements = (await Promise.all(paths.map(path => readFileRequirements(path, projectRoot)))).flat()
  return requirements
}

/** moduleRequirements reads exact npm declarations from an already parsed reachable source. */
export function moduleRequirements(declarations: readonly AST.Declaration[], path: string): ManagedModuleRequirement[] {
  return declarations.filter(isNpmRequirement).map(declaration => moduleRequirement(declaration, path))
}

async function readFileRequirements(path: string, projectRoot: string): Promise<ManagedModuleRequirement[]> {
  const source = await FileSystem.readFile(path, 'utf8')
  const cached = parsedFiles.get(path)
  if (cached?.source === source) {
    return cached.requirements
  }
  const document = transform(parser.parse(source))
    ?? Errors.ThrowUserInput(`Cannot read module requirements from invalid Tao source: ${path}.`)
  validateRequirementPlacement(document.root.declarations, path, projectRoot)
  const requirements = document.root.declarations
    .filter(isNpmRequirement)
    .map(declaration => moduleRequirement(declaration, path))
  parsedFiles.set(path, { source, requirements })
  return requirements
}

function isNpmRequirement(
  declaration: AST.Declaration,
): declaration is Extract<AST.Declaration, { kind: 'RequiresDeclaration' }> {
  return declaration.kind === 'RequiresDeclaration' && declaration.provider === 'npm'
}

function moduleRequirement(
  declaration: Extract<AST.Declaration, { kind: 'RequiresDeclaration' }>,
  path: string,
): ManagedModuleRequirement {
  const version = declaration.version
  if (!version || valid(version) !== version) {
    Errors.ThrowUserInput(`npm dependency ${declaration.identifier} needs an exact version in ${path}.`)
  }
  return { name: declaration.identifier, version, origin: path }
}

const parser = createParser()
const parsedFiles = new Map<string, { source: string; requirements: ManagedModuleRequirement[] }>()
