import * as Tests from '@shared-tests'

import { executeRemote } from '../../../CLIs-src/agent-skills/performance-investigation/Remote'

Tests.test('remote execution quotes each argument and retains background job output', async () => {
  const commands: string[][] = []
  const execute = async (_command: unknown, options: { variadicArgs?: readonly string[] } = {}) => {
    commands.push([...(options.variadicArgs ?? [])])
  }
  await executeRemote(
    'fixture-host',
    ["a'b", '$(touch surprise)', 'two words'],
    { directory: '/Users/ro/Timing Runs', controlPath: '/private/tmp/Timing Fixtures/control.sock' },
    execute,
  )
  Tests.expect(commands[0].at(-1))
    .toBe("cd '/Users/ro/Timing Runs' && exec 'a'\\''b' '$(touch surprise)' 'two words'")
  Tests.expect(commands[0].slice(0, 3)).toEqual(['-S', '/private/tmp/Timing Fixtures/control.sock', '--'])
  await executeRemote('fixture-host', ['./agent', 'performance', 'preview'], {
    directory: '/Users/ro/tao',
    log: '/tmp/job.log',
  }, execute)
  const detached = commands[1].at(-1)!
  Tests.expect(detached).toContain("cd '/Users/ro/tao' || exit")
  Tests.expect(detached).toContain("nohup './agent' 'performance' 'preview' > '/tmp/job.log' 2>&1 < /dev/null &")
})
