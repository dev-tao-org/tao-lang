import type * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import { valid } from 'semver'
import type { ManagedModuleRequirement } from './sidecars/ManagedModules'

/** moduleRequirements reads exact npm declarations from an already parsed reachable source. */
export function moduleRequirements(declarations: readonly AST.Declaration[], path: string): ManagedModuleRequirement[] {
  return declarations.filter(isNpmRequirement).map(declaration => moduleRequirement(declaration, path))
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
