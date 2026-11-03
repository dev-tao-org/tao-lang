import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { checkSourceConformance } from '../../CLIs-src/cli-checks/source-conformance'
import { getSingleLineCallChanges } from '../../CLIs-src/cli-checks/source-conformance-call-layout'
import { fixSourceConformance } from '../../CLIs-src/cli-checks/source-conformance-fix'

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
  Tests.expect(applyChanges(Shared.joinTextLines('  run(', '    alpha,', '    beta,', '  )')).split('\n')[0])
    .toBe('  run(alpha, beta)')
})

Tests.test('call layout > compacts split property callees and fitting if headers', () => {
  const source = S`
    if (
      Regxs.LargeTestShardRegx
        .test(name)
    ) {
      return 1
    }
  `
  Tests.expect(applyChanges(source)).toContain('if (Regxs.LargeTestShardRegx.test(name)) {')
  Tests.expect(applyChanges(Shared.joinTextLines('if (', '  ready(name)', ') {', '  return', '}')))
    .toContain('if (ready(name)) {')
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
    if (
      getValue(
        compute(name),
      )
    ) {
      return 1
    }
    if (
      run(
        alpha, // retain comment
        beta,
      )
    ) {
      return 1
    }
    ${'x'.repeat(105)}.run(
      alpha,
      beta,
    )
  `
  Tests.expect(applyChanges(source)).toBe(source)
})

Tests.test('call layout > collapses an eligible call inside an ineligible outer call', () => {
  const source = Shared.joinTextLines('outer(inner(', '  alpha,', '  beta', '), other())')
  Tests.expect(applyChanges(source)).toBe('outer(inner(alpha, beta), other())')
})

Tests.test('call layout > produces no changes after the first formatting pass', () => {
  const source = Shared.joinTextLines(
    'if (',
    '  service',
    '    .run(',
    '      alpha,',
    '      beta,',
    '    )',
    ') {',
    '  return',
    '}',
  )
  const formatted = applyChanges(source)
  Tests.expect(getSingleLineCallChanges(parse(formatted))).toEqual([])
})

Tests.test('call layout > checker reports and fixer compacts fitting split if headers idempotently', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-call-layout-'))
  await Try(async () => {
    const path = Path.join(root, 'ts/consumer.ts')
    const source = S`
      type TestRegx = { test(value: string): boolean }
      declare const Regxs: { LargeTestShardRegx: TestRegx }
      declare const name: string
      if (
        Regxs.LargeTestShardRegx
          .test(name)
      ) {
        name.toLowerCase()
      }
    `
    await FS.write(path, source)
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow('fit simple calls and if headers on one line')
    await fixSourceConformance(root)
    const fixed = await FS.readFile(path, 'utf8')
    Tests.expect(fixed).toContain('if (Regxs.LargeTestShardRegx.test(name)) {')
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await fixSourceConformance(root)
    Tests.expect(await FS.readFile(path, 'utf8')).toBe(fixed)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
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
