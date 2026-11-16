import { NewlineCharacter } from '@shared'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { analyzeSourceConformance } from '../repo-analysis-src/Source/source-conformance'

/** readConformanceMessages collects finding text for assertions that span several rules. */
export async function readConformanceMessages(root: string): Promise<string> {
  const { findings } = await analyzeSourceConformance(root)
  return findings.map(({ file, line, message }) => `${file}:${line}: ${message}`).join(NewlineCharacter)
}

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
