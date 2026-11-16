import type * as AST from '@ast-gen'
import { NewlineCharacter, Regxs, S } from '@shared'
import * as Shared from '@shared'
import { Path } from '@shared/os'

import { emitStringLiteral } from '../codegen-util'
import { getTypeScriptParameterType } from '../ValuesCompiler'

/** ForeignViewParameterTypes maps the contract's property names to TypeScript type expressions. */
export type ForeignViewParameterTypes = Readonly<Record<string, string>>

/** ForeignViewContractSourceInput carries the named export and props used to create its compiler contract. */
export type ForeignViewContractSourceInput = {
  name: string
  parameters: ForeignViewParameterTypes
  exportRelativePath: string
}

/** projectViewParameterTypes projects validated view parameters to a TypeScript prop contract. */
export function projectViewParameterTypes(declaration: AST.ViewDeclaration): ForeignViewParameterTypes {
  return Object.fromEntries(declaration.parameters.map(parameter => [
    parameter.name.value,
    requireTypeScriptParameterType(parameter),
  ]))
}

/** createForeignViewContractSource emits the module-local React component contract. */
export function createForeignViewContractSource(input: ForeignViewContractSourceInput): string {
  const importPath = input.exportRelativePath.replace(Regxs.TypeScriptModuleExtensionRegx, '')
  const parameters = Object.entries(input.parameters).map(([name, type]) => `  ${name}: ${type}`).join(NewlineCharacter)
  const foreignViewName = input.name
  const resolvedImportPath = emitStringLiteral(Path.toRelativeModuleSpecifier(importPath))
  return Shared.joinTextLines(
    S`
      import type * as React from 'react'
      import { ${foreignViewName} as TaoForeignView } from ${resolvedImportPath}

      export type TaoForeignViewProps = {
    `,
    parameters,
    S`
      }

      const taoForeignViewContract: React.ComponentType<TaoForeignViewProps> = TaoForeignView
      void taoForeignViewContract
    `,
    '',
  )
}

/** compileSidecarAssetDeclarations declares the ordered copied asset formats accepted by sidecar modules. */
export function compileSidecarAssetDeclarations(extensions: readonly string[]): string {
  return extensions.map(extension => `declare module '*${extension}' { const asset: number; export default asset }`)
    .join(NewlineCharacter)
}

function requireTypeScriptParameterType(parameter: AST.Parameter) {
  const type = getTypeScriptParameterType(parameter)
  if (!type) {
    Shared.Errors.ThrowUserInput(`View parameter ${parameter.name.value} must use text or boolean.`)
  }
  return type
}
