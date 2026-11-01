import { NewlineCharacter } from '@shared'
import { Tests } from '@shared/os'
import { sourceSizeDiagnostics } from '../cli-checks/source-size'

Tests.test('source size stays silent through the soft limit and fails after 350 physical lines', () => {
  const source = (lines: number) => ('// line' + NewlineCharacter).repeat(lines)
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', source(250))).toEqual({})
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', source(251))).toEqual({})
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', source(350))).toEqual({})
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', source(351)).error).toContain('at most 350')
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', source(350).trimEnd()).error).toBeUndefined()
})

Tests.test('source size excludes generated and whole-file third-party sources, including marked imports', () => {
  const source = ('// line' + NewlineCharacter).repeat(351)
  for (
    const filename of ['ts/_gen_parser/ast.ts', 'ts/generated/ast.ts', 'ts/vendor/library.ts', 'ts/ast.generated.ts']
  ) {
    Tests.expect(sourceSizeDiagnostics(filename, source)).toEqual({})
  }
  Tests.expect(sourceSizeDiagnostics('ts/ast.ts', ('// @generated' + NewlineCharacter) + source)).toEqual({})
  Tests.expect(
    sourceSizeDiagnostics('ts/library.ts', ('// @third-party https://example.com/source' + NewlineCharacter) + source),
  )
    .toEqual({})
  Tests.expect(sourceSizeDiagnostics('ts/feature.ts', ("const text = '@generated'" + NewlineCharacter) + source).error)
    .toContain('at most 350')
})
