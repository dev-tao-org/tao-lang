import * as AST from '@ast-gen'
import { Errors } from '@shared'
import * as SourceValidation from '@source-validation'
import { valid } from './bridges/Bridge_semver'
import type { ManagedModuleRequirement } from './sidecars/ManagedModule/ManagedModules'

/** collectModuleRequirements reads exact npm declarations from a parsed reachable source. */
export function collectModuleRequirements(document: AST.Document, path: string): ManagedModuleRequirement[] {
  return AST.GetDeclarations(document)
    .filter(isNpmRequirement)
    .map(declaration => createModuleRequirement(declaration, path))
}

/** isNpmRequirement narrows a declaration to a module-owned npm requirement. */
export function isNpmRequirement(
  declaration: AST.Declaration,
): declaration is Extract<AST.Declaration, { kind: 'RequiresDeclaration' }> {
  return declaration.kind === 'RequiresDeclaration' && declaration.provider === 'npm'
}

function createModuleRequirement(
  declaration: Extract<AST.Declaration, { kind: 'RequiresDeclaration' }>,
  path: string,
): ManagedModuleRequirement {
  const version = declaration.version
  if (!version || valid(version) !== version) {
    Errors.ThrowUserInput(`npm dependency ${declaration.identifier} needs an exact version in ${path}.`)
  }
  if (declaration.alias) {
    SourceValidation.requireValidDeclarationName(declaration.alias, path)
  }
  return { name: declaration.identifier, version, origin: path }
}
