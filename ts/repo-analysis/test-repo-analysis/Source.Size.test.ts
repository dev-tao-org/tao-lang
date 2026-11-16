import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'

import { sourceSizeDiagnostic } from '../repo-analysis-src/Source/source-size'

Tests.test('source size stays silent through the soft limit and fails after 350 physical lines', () => {
  const source = (lines: number) => ('// line' + NewlineCharacter).repeat(lines)
  Tests.expect(sourceSizeDiagnostic('ts/feature.ts', source(250))).toBeUndefined()
  Tests.expect(sourceSizeDiagnostic('ts/feature.ts', source(251))).toBeUndefined()
  Tests.expect(sourceSizeDiagnostic('ts/feature.ts', source(350))).toBeUndefined()
  Tests.expect(sourceSizeDiagnostic('ts/feature.ts', source(351))?.message).toContain('at most 350')
  Tests.expect(sourceSizeDiagnostic('ts/feature.ts', source(350).trimEnd())?.message).toBeUndefined()
})

Tests.test('source size excludes generated and whole-file third-party sources, including marked imports', () => {
  const source = ('// line' + NewlineCharacter).repeat(351)
  for (
    const filename of ['ts/_gen_parser/ast.ts', 'ts/generated/ast.ts', 'ts/vendor/library.ts', 'ts/ast.generated.ts']
  ) {
    Tests.expect(sourceSizeDiagnostic(filename, source)).toBeUndefined()
  }
  Tests.expect(sourceSizeDiagnostic('ts/ast.ts', ('// @generated' + NewlineCharacter) + source)).toBeUndefined()
  Tests.expect(
    sourceSizeDiagnostic('ts/library.ts', ('// @third-party https://example.com/source' + NewlineCharacter) + source),
  )
    .toBeUndefined()
  Tests.expect(
    sourceSizeDiagnostic('ts/feature.ts', ("const text = '@generated'" + NewlineCharacter) + source)?.message,
  )
    .toContain('at most 350')
})
