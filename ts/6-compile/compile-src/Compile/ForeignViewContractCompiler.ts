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

/** SidecarAssetDeclarations declares the copied asset formats accepted by sidecar TypeScript modules. */
export const SidecarAssetDeclarations = S`
  declare module '*.png' { const asset: number; export default asset }
  declare module '*.jpg' { const asset: number; export default asset }
  declare module '*.jpeg' { const asset: number; export default asset }
  declare module '*.gif' { const asset: number; export default asset }
  declare module '*.webp' { const asset: number; export default asset }
  declare module '*.svg' { const asset: number; export default asset }
  declare module '*.mp4' { const asset: number; export default asset }
  declare module '*.mp3' { const asset: number; export default asset }
  declare module '*.ttf' { const asset: number; export default asset }
  declare module '*.woff' { const asset: number; export default asset }
  declare module '*.woff2' { const asset: number; export default asset }
  declare module '*.pdf' { const asset: number; export default asset }
`

function requireTypeScriptParameterType(parameter: AST.Parameter) {
  const type = getTypeScriptParameterType(parameter)
  if (!type) {
    Shared.Errors.ThrowUserInput(`View parameter ${parameter.name.value} must use text or boolean.`)
  }
  return type
}
