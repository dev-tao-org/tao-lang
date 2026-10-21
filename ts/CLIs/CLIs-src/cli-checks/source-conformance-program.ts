import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import * as TypeScript from 'typescript'

/** createConformanceProgram loads workspace types once for syntax and type-aware source rules. */
export function createConformanceProgram(root: string, files: string[]): TypeScript.Program {
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const options = FileSystem.existsSync(configPath) ? compilerOptions(configPath) : { strict: true, noEmit: true }
  return TypeScript.createProgram(files, options)
}

function compilerOptions(configPath: string): TypeScript.CompilerOptions {
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
  if (config.error) {
    Errors.ThrowUserInput(TypeScript.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  }
  const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, Path.dirname(configPath))
  const errors = parsed.errors.filter(error => error.code !== 18003)
  if (errors.length > 0) {
    Errors.ThrowUserInput(
      errors.map(error => TypeScript.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
    )
  }
  return parsed.options
}
