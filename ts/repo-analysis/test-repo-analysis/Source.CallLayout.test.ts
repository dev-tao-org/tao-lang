import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { analyzeSourceConformance } from '../repo-analysis-src/Source/source-conformance'
import { getSingleLineCallChanges } from '../repo-analysis-src/Source/source-conformance-call-layout'
import { fixSourceConformance } from '../repo-analysis-src/Source/source-conformance-fix'
import { readConformanceMessages } from './Source.test-fixtures'

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

Tests.test('call layout > leaves comments, multiline items, multiple complex args and excessive width alone', () => {
  const source = S`
    run(
      alpha, // keep this comment
      beta,
    )
    run(
      /'/, // keep the call comment
    )
    function read(
      value = \`prefix\${name}suffix\`, // keep the parameter comment
    ) {}
    if (
      run(/'/) // keep the condition comment
    ) {}
    run(
      value => {
        return value
      },
    )
    run(
      alpha + beta,
      gamma,
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
    ${'x'.repeat(110)}.run(
      'argument',
    )
  `
  Tests.expect(applyChanges(source)).toBe(source)
})

Tests.test('call layout > compacts single arguments and parameters without flattening multiline items', () => {
  const source = S`
    emit(
      'message',
    )
    const failure = new Error(
      'message',
    )
    run(
      alpha + beta,
    )
    function readLabel(
      label: string,
    ): string {
      return label
    }
    const transform = (
      value: string,
    ): string => value
    type ReadLabel = (
      label: string,
    ) => string
    function retainComment(
      // Keep the parameter explanation.
      label: string,
    ) {}
    function retainObject(
      value: {
        label: string
      },
    ) {}
  `
  const formatted = applyChanges(source)
  Tests.expect(formatted).toContain("emit('message')")
  Tests.expect(formatted).toContain("new Error('message')")
  Tests.expect(formatted).toContain('run(alpha + beta)')
  Tests.expect(formatted).toContain('function readLabel(label: string): string {')
  Tests.expect(formatted).toContain('const transform = (value: string): string => value')
  Tests.expect(formatted).toContain('type ReadLabel = (label: string) => string')
  Tests.expect(formatted).toContain('function retainComment(\n')
  Tests.expect(formatted).toContain('function retainObject(\n')
  Tests.expect(getSingleLineCallChanges(parse(formatted))).toEqual([])
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

Tests.test('call layout > checker and fixer enforce fitting calls, single parameters and if headers idempotently', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-call-layout-'))
  await Try(async () => {
    const path = Path.join(root, 'ts/consumer.ts')
    const source = S`
      type TestRegx = { test(value: string): boolean }
      declare const Regxs: { LargeTestShardRegx: TestRegx }
      declare const name: string
      declare const emit: (message: string) => void
      emit(
        'short message',
      )
      function readLabel(
        label: string,
      ): string {
        return label
      }
      if (
        Regxs.LargeTestShardRegx
          .test(name)
      ) {
        name.toLowerCase()
      }
      emit(
        String(
          name,
        ),
      )
    `
    await FS.write(path, source)
    Tests.expect(await readConformanceMessages(root)).toContain(
      'ts/consumer.ts:5: put fitting calls, single-parameter lists and if headers on one line',
    )
    await fixSourceConformance(root)
    const fixed = await FS.readFile(path, 'utf8')
    Tests.expect(fixed).toContain("emit('short message')")
    Tests.expect(fixed).toContain('function readLabel(label: string): string {')
    Tests.expect(fixed).toContain('if (Regxs.LargeTestShardRegx.test(name)) {')
    Tests.expect(fixed).toContain('emit(String(name))')
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
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

Tests.test('call layout leaves Unicode line separators inside template text intact', () => {
  for (const code of [0x2028, 0x2029]) {
    const separator = String.fromCharCode(code)
    const source = 'emit(`before' + separator + 'after`)'
    Tests.expect(getSingleLineCallChanges(parse(source))).toEqual([])
  }
})

function parse(source: string): TypeScript.SourceFile {
  return TypeScript.createSourceFile('/call-layout-fixture.ts', source, TypeScript.ScriptTarget.Latest, true)
}
