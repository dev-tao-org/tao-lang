import { Test } from '@shared/os'
import { sourceSizeDiagnostics } from '../cli-checks/source-size'

Test.test('source size warns after 250 lines and fails after 350 physical lines', () => {
  const source = (lines: number) => '// line\n'.repeat(lines)
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', source(250))).toEqual({})
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', source(251)).warning).toContain('251')
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', source(350))).toEqual({
    warning: 'ts/feature.ts: handwritten TypeScript file exceeds the 250-line soft limit; found 350',
  })
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', source(351)).error).toContain('at most 350')
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', source(350).trimEnd()).error).toBeUndefined()
})

Test.test('source size excludes generated and whole-file third-party sources, including marked imports', () => {
  const source = '// line\n'.repeat(351)
  for (
    const filename of ['ts/_gen_parser/ast.ts', 'ts/generated/ast.ts', 'ts/vendor/library.ts', 'ts/ast.generated.ts']
  ) {
    Test.expect(sourceSizeDiagnostics(filename, source)).toEqual({})
  }
  Test.expect(sourceSizeDiagnostics('ts/ast.ts', '// @generated\n' + source)).toEqual({})
  Test.expect(sourceSizeDiagnostics('ts/library.ts', '// @third-party https://example.com/source\n' + source))
    .toEqual({})
  Test.expect(sourceSizeDiagnostics('ts/feature.ts', "const text = '@generated'\n" + source).error)
    .toContain('at most 350')
})
