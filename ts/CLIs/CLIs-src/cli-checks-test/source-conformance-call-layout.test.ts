import { S } from '@shared'
import { Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { getSingleLineCallChanges } from '../cli-checks/source-conformance-call-layout'

Tests.test('call layout > collapses fitting multiline identifier-only calls', () => {
  const source = S`
    const result = run(
      alpha,
      beta,
      gamma,
      delta,
      epsilon,
      zeta,
      eta,
      theta,
    )
  `
  Tests.expect(applyChanges(source)).toContain(
    'const result = run(alpha, beta, gamma, delta, epsilon, zeta, eta, theta)',
  )
})

Tests.test('call layout > preserves fitting widths, indentation, optional calls and type arguments', () => {
  const source = S`
    await client?.load<Result>(
      alpha,
      beta,
    )
  `
  Tests.expect(applyChanges(source)).toContain('await client?.load<Result>(alpha, beta)')
  Tests.expect(applyChanges('  run(\n    alpha,\n    beta,\n  )').split('\n')[0]).toBe('  run(alpha, beta)')
})

Tests.test('call layout > leaves calls with comments, nonidentifier args, nested calls, or excessive width alone', () => {
  const source = S`
    run(
      alpha, // keep this comment
      beta,
    )
    run(
      alpha + beta,
    )
    run<
      Result,
      Context
    >(
      alpha,
      beta,
    )
    ${'x'.repeat(105)}.run(
      alpha,
      beta,
    )
  `
  Tests.expect(applyChanges(source)).toBe(source)
})

Tests.test('call layout > collapses an eligible call inside an ineligible outer call', () => {
  const source = 'outer(inner(\n  alpha,\n  beta\n), other())'
  Tests.expect(applyChanges(source)).toBe('outer(inner(alpha, beta), other())')
})

Tests.test('call layout > produces no changes after the first formatting pass', () => {
  const source = 'run(\n  alpha,\n  beta,\n)'
  const formatted = applyChanges(source)
  Tests.expect(getSingleLineCallChanges(parse(formatted))).toEqual([])
})

function applyChanges(source: string): string {
  const file = parse(source)
  return getSingleLineCallChanges(file).reduceRight(
    (formatted, change) =>
      formatted.slice(0, change.span.start) + change.newText
      + formatted.slice(change.span.start + change.span.length),
    source,
  )
}

function parse(source: string): TypeScript.SourceFile {
  return TypeScript.createSourceFile('/call-layout-fixture.ts', source, TypeScript.ScriptTarget.Latest, true)
}
