import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** createFixtureProgram binds in-memory sources without loading ambient workspace libraries. */
export function createFixtureProgram(sources: ReadonlyMap<string, string>): TypeScript.Program {
  const host = TypeScript.createCompilerHost({ noLib: true })
  host.getSourceFile = path => {
    const text = sources.get(path)
    return text === undefined
      ? undefined
      : TypeScript.createSourceFile(path, text, TypeScript.ScriptTarget.Latest, true)
  }
  return TypeScript.createProgram([...sources.keys()], { noLib: true }, host)
}
