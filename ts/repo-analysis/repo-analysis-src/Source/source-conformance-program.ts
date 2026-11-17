import { NewlineCharacter, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { isExcludedSource } from './source-size'

/** conformanceSources lists current implementation and agent-script sources for checking and fixing. */
export async function conformanceSources(root: string): Promise<string[]> {
  return [
    ...await FS.listSourceFiles(root + '/ts'),
    ...(await FS.listSourceFiles(root + '/agents/skills')).filter(path => path.includes('/scripts/')),
  ]
}

/** createConformanceProgram loads workspace types once for syntax and type-aware source rules. */
export function createConformanceProgram(root: string, files: string[]): TypeScript.Program {
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const options = FS.existsSync(configPath) ? compilerOptions(configPath) : { strict: true, noEmit: true }
  return TypeScript.createProgram(files, options)
}

/** getEditableConformanceSources selects authored declarations eligible for ordering changes. */
export function getEditableConformanceSources(
  program: TypeScript.Program,
  filenames: readonly string[],
): ReadonlySet<TypeScript.SourceFile> {
  const sources = new Set<TypeScript.SourceFile>()
  for (const filename of filenames) {
    const file = program.getSourceFile(filename)
    if (file && !file.isDeclarationFile && !isExcludedSource(file.fileName, file.text)) {
      sources.add(file)
    }
  }
  return sources
}

function compilerOptions(configPath: string): TypeScript.CompilerOptions {
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
  if (config.error) {
    UserInput.Fail(TypeScript.flattenDiagnosticMessageText(config.error.messageText, NewlineCharacter))
  }
  const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, Path.dirname(configPath))
  const errors = parsed.errors.filter(error => error.code !== 18003)
  if (errors.length > 0) {
    UserInput.Fail(
      errors.map(error => TypeScript.flattenDiagnosticMessageText(error.messageText, NewlineCharacter)).join(
        NewlineCharacter,
      ),
    )
  }
  return parsed.options
}
