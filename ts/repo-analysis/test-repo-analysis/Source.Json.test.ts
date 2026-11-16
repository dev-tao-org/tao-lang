import { S } from '@shared'
import * as Tests from '@shared-tests'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { rawJsonIssue } from '../repo-analysis-src/Source/source-conformance-json'

Tests.test('JSON boundary catches native aliases and global access without mistaking local data or emitted source', () => {
  const source = S`
    JSON.parse('{}')
    JSON['stringify']({})
    const raw = JSON
    const { parse } = JSON
    const captured = { JSON }
    globalThis.JSON.parse('{}')
    globalThis['JSON'].stringify({})
    const emitted = 'JSON.parse(source)'
    const owner = { JSON: { parse(value: string) { return value } } }
    owner.JSON.parse('{}')
    function local(JSON: { parse(value: string): string }) { return JSON.parse('{}') }
  `
  const { file, checker } = createFixture(source)
  Tests.expect(issueLines(file, checker, 'ts/example.ts')).toEqual([1, 2, 3, 4, 5, 6, 7])
  Tests.expect(issueLines(file, checker, 'ts/shared/shared-src/universal/Json/Native.ts')).toEqual([])
})

function createFixture(source: string) {
  const path = '/json-conformance-fixture.ts'
  const options: TypeScript.CompilerOptions = { target: TypeScript.ScriptTarget.ESNext, noEmit: true }
  const host = TypeScript.createCompilerHost(options)
  const readSource = host.getSourceFile.bind(host)
  const file = TypeScript.createSourceFile(path, source, options.target!, true)
  host.getSourceFile = (filename, version, onError, fresh) =>
    filename === path ? file : readSource(filename, version, onError, fresh)
  const program = TypeScript.createProgram([path], options, host)
  return { file, checker: program.getTypeChecker() }
}

function issueLines(file: TypeScript.SourceFile, checker: TypeScript.TypeChecker, filename: string): number[] {
  const lines: number[] = []
  const visit = (node: TypeScript.Node): void => {
    if (rawJsonIssue(node, filename, checker)) {
      lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return lines
}
