import { Errors } from '@shared'
import type { LinkedProgram } from '@typecheck/Modules'
import { emitStringLiteral } from './codegen-util'
import { compileModuleImport } from './GeneratedPaths'
import type { GeneratedModulePaths } from './GeneratedPaths'
import { emitScope } from './RuntimeEmitter'

/** ModuleInitialization contains shared bootstrap imports and ordered instance-local scope wiring. */
export type ModuleInitialization = {
  imports: string
  body: string
  scopes: ReadonlyMap<string, string>
}

/** compileModuleInitialization preserves app and library alias, declaration and value initialization order. */
export function compileModuleInitialization(
  program: LinkedProgram,
  bootstrap: string,
  paths: GeneratedModulePaths,
): ModuleInitialization {
  const scopes = new Map(program.modules.map((module, index) => [module.path, `_scope${index}`]))
  const imports = program.modules.map((module, index) =>
    `import * as Source${index} from ${compileModuleImport(bootstrap, paths.get(module.path)!)};`
  )
  const declarations = program.modules.map((_module, index) => emitScope(`_scope${index}`, `Source${index}.Scope`))
  const records = program.modules.map((module, index) =>
    `${emitStringLiteral(paths.get(module.path)!)}: _scope${index}`
  )
  const aliases = program.modules.map((_module, index) => `Source${index}.bindAliases(_scope${index}, _Modules);`)
  const bindings = program.modules.map((_module, index) => `Source${index}.bindDeclarations(_scope${index});`)
  const values = program.definitions.map(definition => {
    const index = program.modules.findIndex(module => module.path === definition.source)
    if (index < 0) {
      Errors.ThrowShouldNeverHappen(`Initialization source is missing: ${definition.source}.`)
    }
    return `Source${index}.initialize${definition.declaration.name.value}(_scope${index});`
  })
  const body = [...declarations, `const _Modules = { ${records.join(',\n')} };`, ...aliases, ...bindings, ...values]
  return { imports: imports.join('\n'), body: body.join('\n'), scopes }
}
