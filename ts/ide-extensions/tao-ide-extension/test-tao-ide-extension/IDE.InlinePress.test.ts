import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { FS, Repo } from '@shared/os'
import { loadRuntime } from './IDE.test-utils'

const Handler = 'on press -> do Reset()'
const Fixture = Repo.resolvePath('Apps/Tests/Language/TextStateActions.tao')
const FollowingBinding = 'let Caption = "Still a separate binding"'
const ExpectedBody = 'Expected a `do` call, a `set` statement, or a `{ … }` block after `->`.'
const ExpectedArguments = 'Expected an argument list in parentheses after the action name.'

Tests.test('unfinished press handlers report the exact edited token or insertion point', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
    const fixture = '// 😀' + Shared.NewlineCharacter + FS.readFileSync(Fixture, 'utf8')
    const cases = [
      ['->', '->', ExpectedBody],
      ['-> d', 'd', ExpectedBody],
      ['-> se', 'se', ExpectedBody],
      ['-> do', '', 'Expected an action name after `do`.'],
      ['-> do R', '', ExpectedArguments],
      ['-> do Reset', '', ExpectedArguments],
      ['-> do Controls.Reset', '', ExpectedArguments],
      ['-> set', '', 'Expected a state name after `set`.'],
      ['-> set Status', '', 'Expected `=` after the state name.'],
      ['-> set Status =', '', 'Expected a value after `=`.'],
    ] as const
    for (const newline of ['\n', '\r\n']) {
      const source = fixture.replaceAll('\n', newline)
      for (const [prefix, marked, message] of cases) {
        const handler = 'on press ' + prefix
        const end = source.indexOf(Handler) + handler.length
        const expected = [{ range: Shared.Range(end - marked.length, end), message }]
        for (const suffix of ['', newline + '        ' + FollowingBinding, ' ' + FollowingBinding]) {
          const edited = source.replace(Handler, handler + suffix)
          const result = runtime.document.update(edited)
          Tests.expect({ prefix, suffix, diagnostics: result.diagnostics }).toEqual({
            prefix,
            suffix,
            diagnostics: expected,
          })
        }
      }
      Tests.expect(runtime.document.update(source).diagnostics).toEqual([])
    }
  }, { finally: runtime.dispose })
})

Tests.test('the invalid do-block prefix preserves independent syntax errors and probes at most once', async () => {
  const phases: string[] = []
  const runtime = await loadRuntime(phase => phases.push(phase))
  Shared.Try(() => {
    const source = FS.readFileSync(Fixture, 'utf8').replace('let Status = "Later render binding"', 'let Broken =')
    const first = source.replace(Handler, 'on press -> do {')
    const start = first.indexOf('do {')
    const expected = {
      range: Shared.Range(start, start + 'do'.length),
      message: 'Start a block with `-> {`. Use `do` to call an action.',
    }
    const later = first.indexOf('let Broken =') + 'let Broken ='.length
    Tests.expect(runtime.document.update(first).diagnostics).toEqual([
      expected,
      { range: Shared.Range(later, later), message: 'Expected Identifier' },
    ])
    Tests.expect(phases.filter(phase => phase === 'tao.diagnostic-probe')).toHaveLength(1)
    phases.length = 0
    Tests.expect(runtime.document.update(source).diagnostics).toHaveLength(1)
    Tests.expect(phases.filter(phase => phase === 'tao.diagnostic-probe')).toHaveLength(0)
    phases.length = 0
    const local = FS.readFileSync(Fixture, 'utf8').replace(Handler, 'on press -> do Reset')
    Tests.expect(runtime.document.update(local).diagnostics).toHaveLength(1)
    Tests.expect(phases.filter(phase => phase === 'tao.diagnostic-probe')).toHaveLength(0)
  }, { finally: runtime.dispose })
})

Tests.test('opened arguments and blocks keep their later syntax diagnostics and other text is opaque', async () => {
  const phases: string[] = []
  const runtime = await loadRuntime(phase => phases.push(phase))
  Shared.Try(() => {
    const fixture = FS.readFileSync(Fixture, 'utf8')
    const decoys = Shared.S`
      // on press -> do
      let Example = "on press -> do"
    ` + Shared.NewlineCharacter
    const injection = 'view Foreign { render inject ```ts const text = "on press -> do"; return <Thing> ``` }'
    for (
      const handler of [
        Shared.S`
          on press -> do Reset(
            =
          )
        `,
        Shared.S`
          on press -> {
            do Reset(=)
          }
        `,
      ]
    ) {
      const source = decoys + fixture.replace(Handler, handler)
      const start = source.indexOf(handler) + handler.indexOf('=')
      Tests.expect(runtime.document.update(source).diagnostics).toEqual([
        { range: Shared.Range(start, start + 1), message: 'Unexpected syntax' },
      ])
      Tests.expect(runtime.document.update(source + injection).diagnostics[0]?.range.start).toBe(start)
      Tests.expect(runtime.document.update(source + injection).diagnostics.length).toBeGreaterThan(1)
    }
    Tests.expect(phases.filter(phase => phase === 'tao.diagnostic-probe')).toHaveLength(0)
  }, { finally: runtime.dispose })
})
