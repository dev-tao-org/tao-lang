import { FileSystem, Repo, Tests } from '@shared/os'
import * as TypeScript from 'typescript'

const unreachableCode = 7027

// unreachableDiagnostics reports TS7027 for a fixture checked with allowUnreachableCode disabled.
function unreachableDiagnostics(source: string): number[] {
  const host = TypeScript.createCompilerHost({ allowUnreachableCode: false, noEmit: true, strict: true })
  const originalRead = host.readFile.bind(host)
  host.readFile = path => path.endsWith('fixture.ts') ? source : originalRead(path)
  const program = TypeScript.createProgram(
    ['fixture.ts'],
    { allowUnreachableCode: false, noEmit: true, strict: true },
    host,
  )
  return TypeScript.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName.endsWith('fixture.ts'))
    .map(diagnostic => diagnostic.code)
}

Tests.test('check rejects unreachable code after never exits and throw statements', async () => {
  const base = JSON.parse(await FileSystem.file(Repo.resolvePath('ts/tsconfig.base.json')).text()) as {
    compilerOptions: { allowUnreachableCode?: boolean }
  }
  Tests.expect(base.compilerOptions.allowUnreachableCode).toBe(false)
  for (
    const source of [
      'declare function Throw(): never\nfunction f(){ Throw(); console.log(1) }',
      'declare function Throw(): never\nfunction f(){ return Throw(); console.log(2) }',
      'function f(){ throw new Error(); console.log(3) }',
    ]
  ) {
    Tests.expect(unreachableDiagnostics(source)).toEqual([unreachableCode])
  }
})
